import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  __resetStaticCache,
  buildOpenApiSpec,
  buildSqlPathItem,
  buildSqlSpec,
  collectReferencedComponents,
  getStaticMergedSpec,
  ruleToSchema,
  type OpenApiObject
} from './openapi-spec';
import {
  closeDB,
  createApp,
  createConnection,
  createSql,
  type SqlRecord
} from './sqlite';

describe('openapi-spec ruleToSchema', () => {
  it('maps required|integer', () => {
    const { schema, required } = ruleToSchema('required|integer');
    assert.strictEqual(required, true);
    assert.strictEqual(schema.type, 'integer');
  });

  it('maps string with min/max as length', () => {
    const { schema, required } = ruleToSchema('required|string|min:2|max:64');
    assert.strictEqual(required, true);
    assert.strictEqual(schema.type, 'string');
    assert.strictEqual(schema.minLength, 2);
    assert.strictEqual(schema.maxLength, 64);
  });

  it('maps numeric with min/max as bounds', () => {
    const { schema } = ruleToSchema('numeric|min:1|max:100');
    assert.strictEqual(schema.type, 'number');
    assert.strictEqual(schema.minimum, 1);
    assert.strictEqual(schema.maximum, 100);
  });

  it('maps in: enum and email format', () => {
    const enumResult = ruleToSchema('in:a,b,c');
    assert.deepStrictEqual(enumResult.schema.enum, ['a', 'b', 'c']);

    const emailResult = ruleToSchema('required|email');
    assert.strictEqual(emailResult.schema.format, 'email');
    assert.strictEqual(emailResult.required, true);
  });

  it('includes default value', () => {
    const { schema } = ruleToSchema('integer', 10);
    assert.strictEqual(schema.default, 10);
  });
});

describe('openapi-spec static merge', () => {
  before(() => {
    __resetStaticCache();
  });

  it('merges public /openapi paths only', () => {
    const spec = getStaticMergedSpec();
    const paths = spec.paths as OpenApiObject;
    assert.ok(paths['/openapi/invoke/{uuid}']);
    assert.ok(paths['/openapi/connections']);
    assert.ok(paths['/openapi/sqls']);
    assert.ok(paths['/openapi/models']);

    for (const path of Object.keys(paths)) {
      assert.ok(
        path.startsWith('/openapi/'),
        `console path leaked into merge: ${path}`
      );
    }
    assert.strictEqual(paths['/api/login'], undefined);
    assert.strictEqual(paths['/api/stats/overview'], undefined);
  });

  it('keeps invoke response schemas under original names', () => {
    const components = (getStaticMergedSpec().components as OpenApiObject)
      .schemas as OpenApiObject;
    assert.ok(components.InvokeSelectResponse);
    assert.ok(components.InvokeWriteResponse);
    assert.ok(components.InvokeComplexResponse);
  });

  it('includes bearerAuth only (no cookieAuth)', () => {
    const schemes = (getStaticMergedSpec().components as OpenApiObject)
      .securitySchemes as OpenApiObject;
    assert.ok(schemes.bearerAuth);
    assert.strictEqual(schemes.cookieAuth, undefined);
  });
});

describe('openapi-spec dynamic SQL paths', function () {
  this.timeout(10000);

  let tmpDir: string;
  let selectRecord: SqlRecord;
  let insertRecord: SqlRecord;
  let appA: string;
  let appB: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sql2api-oas-'));
    process.env.SQLITE_PATH = path.join(tmpDir, 'test.db');
    process.env.APP_SECRET = 'test-secret-for-oas';
    closeDB();
    __resetStaticCache();

    const a = createApp('oas-app-a');
    const b = createApp('oas-app-b');
    appA = a.id;
    appB = b.id;

    const connA = createConnection({
      app_id: a.id,
      name: 'conn-a',
      type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      database: 'demo',
      username: 'root',
      password: 'secret'
    });
    const connB = createConnection({
      app_id: b.id,
      name: 'conn-b',
      type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      database: 'demo',
      username: 'root',
      password: 'secret'
    });

    selectRecord = createSql({
      app_id: a.id,
      connection_id: connA.id,
      name: 'get-user',
      description: 'Get user by id',
      sql_text: 'SELECT * FROM users WHERE id = :id',
      sql_type: 'select',
      method: 'GET',
      params: [
        { name: 'id', rule: 'required|integer', description: 'User id' }
      ],
      status: 'enabled',
      review: { passed: true, issues: [] }
    });

    insertRecord = createSql({
      app_id: a.id,
      connection_id: connA.id,
      name: 'create-user',
      description: 'Create user',
      sql_text: 'INSERT INTO users (name) VALUES (:name)',
      sql_type: 'insert',
      method: 'POST',
      params: [
        { name: 'name', rule: 'required|string|max:64', description: 'Name' }
      ],
      status: 'enabled',
      review: { passed: true, issues: [] }
    });

    createSql({
      app_id: b.id,
      connection_id: connB.id,
      name: 'other-app-sql',
      description: 'Other',
      sql_text: 'SELECT 1',
      sql_type: 'select',
      method: 'GET',
      params: [],
      status: 'enabled',
      review: { passed: true, issues: [] }
    });

    createSql({
      app_id: a.id,
      connection_id: connA.id,
      name: 'disabled-sql',
      description: 'Disabled',
      sql_text: 'SELECT 2',
      sql_type: 'select',
      method: 'GET',
      params: [],
      status: 'disabled',
      review: { passed: true, issues: [] }
    });
  });

  after(() => {
    closeDB();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.SQLITE_PATH;
  });

  it('builds select path with query parameters', () => {
    const { path, method, operation } = buildSqlPathItem(selectRecord, {
      tag: 'App: oas-app-a'
    });
    assert.strictEqual(path, `/openapi/invoke/${selectRecord.id}`);
    assert.strictEqual(method, 'get');
    assert.ok(Array.isArray(operation.parameters));
    const params = operation.parameters as OpenApiObject[];
    assert.strictEqual(params[0].name, 'id');
    assert.strictEqual(params[0].in, 'query');
    assert.strictEqual(params[0].required, true);
  });

  it('builds insert path with requestBody', () => {
    const { method, operation } = buildSqlPathItem(insertRecord);
    assert.strictEqual(method, 'post');
    assert.ok(operation.requestBody);
    const content = (operation.requestBody as OpenApiObject).content as OpenApiObject;
    const json = content['application/json'] as OpenApiObject;
    const schema = json.schema as OpenApiObject;
    assert.strictEqual(schema.type, 'object');
    const props = schema.properties as OpenApiObject;
    assert.ok(props.name);
  });

  it('filters dynamic paths by appId', () => {
    const all = buildOpenApiSpec({ appId: null, serverUrl: 'http://test' });
    const filtered = buildOpenApiSpec({
      appId: appA,
      serverUrl: 'http://test'
    });
    const allPaths = all.paths as OpenApiObject;
    const filteredPaths = filtered.paths as OpenApiObject;

    assert.ok(allPaths[`/openapi/invoke/${selectRecord.id}`]);
    assert.ok(filteredPaths[`/openapi/invoke/${selectRecord.id}`]);

    // App B SQL should only appear in unfiltered (or appB) spec
    const appBPaths = Object.keys(allPaths).filter((p) =>
      p.startsWith('/openapi/invoke/')
    );
    assert.ok(appBPaths.length >= 2);

    const filteredDynamic = Object.keys(filteredPaths).filter((p) =>
      p.startsWith('/openapi/invoke/') && !p.includes('{uuid}')
    );
    assert.ok(
      filteredDynamic.every((p) =>
        p === `/openapi/invoke/${selectRecord.id}`
        || p === `/openapi/invoke/${insertRecord.id}`
      )
    );
    assert.ok(!filteredPaths[`/openapi/invoke/${appB}`]);
  });

  it('excludes disabled SQL from merged spec', () => {
    const spec = buildOpenApiSpec({ appId: appA });
    const paths = spec.paths as OpenApiObject;
    const dynamic = Object.keys(paths).filter(
      (p) => p.startsWith('/openapi/invoke/') && !p.includes('{uuid}')
    );
    assert.strictEqual(dynamic.length, 2);
  });

  it('builds self-contained single SQL spec with resolved $refs', () => {
    const mini = buildSqlSpec(selectRecord, {
      serverUrl: 'http://127.0.0.1:13334'
    });
    assert.strictEqual((mini.info as OpenApiObject).title, 'get-user');
    const paths = mini.paths as OpenApiObject;
    assert.ok(paths[`/openapi/invoke/${selectRecord.id}`]);

    const components = mini.components as OpenApiObject;
    assert.ok((components.schemas as OpenApiObject).InvokeSelectResponse);
    assert.ok((components.securitySchemes as OpenApiObject).bearerAuth);

    // Every $ref in the mini spec should resolve inside its components
    const refs = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== 'object') {
        return;
      }
      const obj = node as Record<string, unknown>;
      if (typeof obj.$ref === 'string') {
        refs.add(obj.$ref);
      }
      Object.values(obj).forEach(walk);
    };
    walk(mini);

    for (const ref of refs) {
      const match = /^#\/components\/([^/]+)\/(.+)$/.exec(ref);
      assert.ok(match, `unexpected ref ${ref}`);
      const section = (components[match![1]] as OpenApiObject) || {};
      assert.ok(
        section[match![2]] !== undefined,
        `dangling $ref ${ref}`
      );
    }
  });

  it('collectReferencedComponents follows nested refs', () => {
    const staticSpec = getStaticMergedSpec();
    const all = staticSpec.components as OpenApiObject;
    const root = {
      schema: { $ref: '#/components/schemas/InvokeSelectResponse' }
    };
    const collected = collectReferencedComponents(root, all);
    assert.ok((collected.schemas as OpenApiObject).InvokeSelectResponse);
    assert.ok((collected.schemas as OpenApiObject).ApiEnvelopeBase);
  });
});
