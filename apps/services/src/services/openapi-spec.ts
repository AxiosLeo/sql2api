import type { HttpMethod, SqlParamDef, SqlType } from '../types';
import type { SqlRecord } from './sqlite';
import { getApp, listAllSqls } from './sqlite';
import pkg from '../../package.json';

import invokeSpec from './openapi-specs/openapi.invoke.json';
import connectionSpec from './openapi-specs/openapi.connection.json';
import modelSpec from './openapi-specs/openapi.model.json';
import sqlSpec from './openapi-specs/openapi.sql.json';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type OpenApiObject = { [key: string]: JsonValue };

export interface RuleSchemaResult {
  schema: OpenApiObject;
  required: boolean;
}

export interface BuildOpenApiOptions {
  /** Filter dynamic SQL paths by app; null = all apps. */
  appId?: string | null;
  /** Server URL written into servers[].url. */
  serverUrl?: string;
}

export interface BuildSqlSpecOptions {
  serverUrl?: string;
}

interface SpecFragment {
  prefix: string;
  doc: OpenApiObject;
}

const RESPONSE_BY_SQL_TYPE: Record<SqlType, string> = {
  select: 'InvokeSelectResponse',
  insert: 'InvokeWriteResponse',
  update: 'InvokeWriteResponse',
  complex: 'InvokeComplexResponse'
};

const COMMON_ERROR_RESPONSES = [
  'BadData',
  'Unauthorized',
  'Forbidden',
  'NotFound',
  'MethodNotAllowed',
  'BadGateway'
] as const;

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (a === null || b === null) {
    return a === b;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keysA = Object.keys(ao);
    const keysB = Object.keys(bo);
    if (keysA.length !== keysB.length) {
      return false;
    }
    return keysA.every((k) => deepEqual(ao[k], bo[k]));
  }
  return false;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Rewrite `#/components/<section>/<name>` refs inside a fragment when names are remapped. */
function rewriteRefs(
  node: JsonValue,
  remaps: Map<string, Map<string, string>>
): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      rewriteRefs(item, remaps);
    }
    return;
  }
  if (!node || typeof node !== 'object') {
    return;
  }
  const obj = node as OpenApiObject;
  if (typeof obj.$ref === 'string') {
    const match = /^#\/components\/([^/]+)\/(.+)$/.exec(obj.$ref);
    if (match) {
      const section = match[1];
      const name = match[2];
      const sectionMap = remaps.get(section);
      const newName = sectionMap?.get(name);
      if (newName) {
        obj.$ref = `#/components/${section}/${newName}`;
      }
    }
  }
  for (const value of Object.values(obj)) {
    rewriteRefs(value, remaps);
  }
}

function ensureSection(
  components: OpenApiObject,
  section: string
): OpenApiObject {
  if (!components[section] || typeof components[section] !== 'object') {
    components[section] = {};
  }
  return components[section] as OpenApiObject;
}

/**
 * Merge a fragment's components into the target. Same-name deep-equal entries
 * are deduped; conflicts are renamed with the fragment prefix and local $refs
 * are rewritten.
 */
function mergeComponents(
  target: OpenApiObject,
  fragment: SpecFragment
): void {
  const source = (fragment.doc.components || {}) as OpenApiObject;
  const remaps = new Map<string, Map<string, string>>();

  for (const [section, sectionValue] of Object.entries(source)) {
    if (!sectionValue || typeof sectionValue !== 'object') {
      continue;
    }
    const targetSection = ensureSection(target, section);
    const sectionRemap = new Map<string, string>();

    for (const [name, value] of Object.entries(sectionValue as OpenApiObject)) {
      if (targetSection[name] === undefined) {
        targetSection[name] = deepClone(value);
        continue;
      }
      if (deepEqual(targetSection[name], value)) {
        continue;
      }
      const renamed = `${fragment.prefix}${name}`;
      targetSection[renamed] = deepClone(value);
      sectionRemap.set(name, renamed);
    }

    if (sectionRemap.size > 0) {
      remaps.set(section, sectionRemap);
    }
  }

  if (remaps.size > 0) {
    rewriteRefs(fragment.doc, remaps);
  }
}

function mergePaths(target: OpenApiObject, source: OpenApiObject): void {
  const paths = (source.paths || {}) as OpenApiObject;
  for (const [path, methods] of Object.entries(paths)) {
    if (!target[path]) {
      target[path] = deepClone(methods);
      continue;
    }
    const existing = target[path] as OpenApiObject;
    const incoming = methods as OpenApiObject;
    for (const [method, operation] of Object.entries(incoming)) {
      existing[method] = deepClone(operation);
    }
  }
}

function mergeTags(
  target: OpenApiObject[],
  source: JsonValue | undefined
): void {
  if (!Array.isArray(source)) {
    return;
  }
  const existing = new Set(
    target
      .map((t) => (typeof t.name === 'string' ? t.name : ''))
      .filter(Boolean)
  );
  for (const tag of source) {
    if (!tag || typeof tag !== 'object') {
      continue;
    }
    const name = (tag as OpenApiObject).name;
    if (typeof name === 'string' && !existing.has(name)) {
      target.push(deepClone(tag as OpenApiObject));
      existing.add(name);
    }
  }
}

/**
 * Convert a validatorjs rule string into an OpenAPI schema + required flag.
 */
export function ruleToSchema(
  rule: string,
  defaultValue?: unknown
): RuleSchemaResult {
  const parts = rule
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);

  let required = false;
  const schema: OpenApiObject = { type: 'string' };
  let isNumeric = false;
  let isString = true;

  for (const part of parts) {
    if (part === 'required') {
      required = true;
      continue;
    }
    if (part === 'integer') {
      schema.type = 'integer';
      isNumeric = true;
      isString = false;
      continue;
    }
    if (part === 'numeric') {
      schema.type = 'number';
      isNumeric = true;
      isString = false;
      continue;
    }
    if (part === 'boolean') {
      schema.type = 'boolean';
      isNumeric = false;
      isString = false;
      continue;
    }
    if (part === 'array') {
      schema.type = 'array';
      schema.items = { type: 'string' };
      isNumeric = false;
      isString = false;
      continue;
    }
    if (part === 'string') {
      schema.type = 'string';
      isString = true;
      isNumeric = false;
      continue;
    }
    if (part === 'email') {
      schema.type = 'string';
      schema.format = 'email';
      isString = true;
      continue;
    }
    if (part === 'url') {
      schema.type = 'string';
      schema.format = 'uri';
      isString = true;
      continue;
    }
    if (part === 'date') {
      schema.type = 'string';
      schema.format = 'date';
      isString = true;
      continue;
    }

    const inMatch = /^in:(.+)$/.exec(part);
    if (inMatch) {
      schema.enum = inMatch[1].split(',').map((v) => v.trim());
      continue;
    }

    const minMatch = /^min:(\d+(?:\.\d+)?)$/.exec(part);
    if (minMatch) {
      const n = Number(minMatch[1]);
      if (isNumeric) {
        schema.minimum = n;
      } else if (isString || schema.type === 'string') {
        schema.minLength = Math.floor(n);
      } else if (schema.type === 'array') {
        schema.minItems = Math.floor(n);
      }
      continue;
    }

    const maxMatch = /^max:(\d+(?:\.\d+)?)$/.exec(part);
    if (maxMatch) {
      const n = Number(maxMatch[1]);
      if (isNumeric) {
        schema.maximum = n;
      } else if (isString || schema.type === 'string') {
        schema.maxLength = Math.floor(n);
      } else if (schema.type === 'array') {
        schema.maxItems = Math.floor(n);
      }
      continue;
    }
  }

  if (defaultValue !== undefined) {
    schema.default = defaultValue as JsonValue;
  }

  return { schema, required };
}

function parseParams(paramsJson: string): SqlParamDef[] {
  try {
    const parsed = JSON.parse(paramsJson || '[]') as SqlParamDef[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function exampleFromSchema(schema: OpenApiObject, name: string): unknown {
  if (schema.default !== undefined) {
    return schema.default;
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }
  switch (schema.type) {
    case 'integer':
      return 1;
    case 'number':
      return 1.0;
    case 'boolean':
      return true;
    case 'array':
      return [];
    default:
      return name === 'id' ? '1' : `example_${name}`;
  }
}

function buildErrorResponseRefs(): OpenApiObject {
  const responses: OpenApiObject = {};
  for (const name of COMMON_ERROR_RESPONSES) {
    const status =
      name === 'BadData'
        ? '400'
        : name === 'Unauthorized'
          ? '401'
          : name === 'Forbidden'
            ? '403'
            : name === 'NotFound'
              ? '404'
              : name === 'MethodNotAllowed'
                ? '405'
                : '502';
    responses[status] = { $ref: `#/components/responses/${name}` };
  }
  return responses;
}

/**
 * Build a single OpenAPI path item (one HTTP method) for a registered SQL.
 */
export function buildSqlPathItem(
  record: SqlRecord,
  options: { tag?: string } = {}
): { path: string; method: string; operation: OpenApiObject } {
  const params = parseParams(record.params_json);
  const method = record.method.toLowerCase();
  const path = `/openapi/invoke/${record.id}`;
  const tag = options.tag || 'SQL APIs';
  const isQuery =
    record.method === 'GET' || (record.method as string) === 'DELETE';

  const operation: OpenApiObject = {
    tags: [tag],
    summary: record.name,
    description:
      record.description
      || `Invoke registered SQL "${record.name}" (${record.sql_type} → ${record.method}).`,
    operationId: `invoke_${record.id.replace(/-/g, '_')}`,
    security: [{ bearerAuth: [] }],
    responses: {
      '200': {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              $ref: `#/components/schemas/${RESPONSE_BY_SQL_TYPE[record.sql_type]}`
            }
          }
        }
      },
      ...buildErrorResponseRefs()
    }
  };

  if (isQuery) {
    const parameters: OpenApiObject[] = [];
    for (const param of params) {
      const { schema, required } = ruleToSchema(param.rule, param.default);
      const descriptionParts = [
        param.description || '',
        `rule: ${param.rule}`
      ].filter(Boolean);
      parameters.push({
        name: param.name,
        in: 'query',
        required,
        schema,
        description: descriptionParts.join(' — ')
      });
    }
    if (parameters.length > 0) {
      operation.parameters = parameters;
    }
  } else {
    const properties: OpenApiObject = {};
    const required: string[] = [];
    const example: OpenApiObject = {};
    for (const param of params) {
      const { schema, required: isRequired } = ruleToSchema(
        param.rule,
        param.default
      );
      const descriptionParts = [
        param.description || '',
        `rule: ${param.rule}`
      ].filter(Boolean);
      properties[param.name] = {
        ...schema,
        description: descriptionParts.join(' — ')
      };
      if (isRequired) {
        required.push(param.name);
      }
      example[param.name] = exampleFromSchema(schema, param.name) as JsonValue;
    }
    const bodySchema: OpenApiObject = {
      type: 'object',
      additionalProperties: false,
      properties
    };
    if (required.length > 0) {
      bodySchema.required = required;
    }
    operation.requestBody = {
      required: required.length > 0,
      content: {
        'application/json': {
          schema: bodySchema,
          example
        }
      }
    };
  }

  return { path, method, operation };
}

function collectRefs(
  node: JsonValue,
  collected: Set<string>
): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectRefs(item, collected);
    }
    return;
  }
  if (!node || typeof node !== 'object') {
    return;
  }
  const obj = node as OpenApiObject;
  if (typeof obj.$ref === 'string') {
    const match = /^#\/components\/([^/]+)\/(.+)$/.exec(obj.$ref);
    if (match) {
      collected.add(`${match[1]}/${match[2]}`);
    }
  }
  for (const value of Object.values(obj)) {
    collectRefs(value, collected);
  }
}

/**
 * Recursively gather component definitions referenced by a node from a
 * components bag (used to produce a self-contained mini-spec).
 */
export function collectReferencedComponents(
  root: JsonValue,
  allComponents: OpenApiObject
): OpenApiObject {
  const result: OpenApiObject = {};
  const pending = new Set<string>();
  collectRefs(root, pending);
  const visited = new Set<string>();

  while (pending.size > 0) {
    const key = pending.values().next().value as string;
    pending.delete(key);
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);

    const [section, name] = key.split('/');
    const sectionBag = allComponents[section] as OpenApiObject | undefined;
    if (!sectionBag || sectionBag[name] === undefined) {
      continue;
    }
    if (!result[section]) {
      result[section] = {};
    }
    (result[section] as OpenApiObject)[name] = deepClone(sectionBag[name]);
    collectRefs(sectionBag[name], pending);
  }

  return result;
}

function buildStaticMerged(): OpenApiObject {
  // Public /openapi/* surface only. Admin/stats (/api/*) are console Session
  // APIs and must not appear in Api-Key OpenAPI docs.
  // Invoke first so its shared response/schema names win for dynamic paths.
  const fragments: SpecFragment[] = [
    { prefix: 'Invoke', doc: deepClone(invokeSpec as unknown as OpenApiObject) },
    { prefix: 'Connection', doc: deepClone(connectionSpec as unknown as OpenApiObject) },
    { prefix: 'Model', doc: deepClone(modelSpec as unknown as OpenApiObject) },
    { prefix: 'Sql', doc: deepClone(sqlSpec as unknown as OpenApiObject) }
  ];

  const components: OpenApiObject = {};
  const paths: OpenApiObject = {};
  const tags: OpenApiObject[] = [];

  for (const fragment of fragments) {
    mergeComponents(components, fragment);
    mergePaths(paths, fragment.doc);
    mergeTags(tags, fragment.doc.tags);
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'sql2api API',
      description:
        'Merged OpenAPI document for sql2api public /openapi/* APIs and dynamically registered SQL invoke endpoints. Console /api/* routes use Session auth and are not included.',
      version: pkg.version || '0.0.1'
    },
    servers: [
      {
        url: 'http://127.0.0.1:13334',
        description: 'Local development'
      }
    ],
    tags,
    security: [{ bearerAuth: [] }],
    paths,
    components
  };
}

/** Cached static merge (paths + components from hand-written specs). */
let cachedStatic: OpenApiObject | null = null;

export function getStaticMergedSpec(): OpenApiObject {
  if (!cachedStatic) {
    cachedStatic = buildStaticMerged();
  }
  return deepClone(cachedStatic);
}

function resolveAppTag(appId: string): string {
  const app = getApp(appId);
  return app ? `App: ${app.name}` : `App: ${appId}`;
}

/**
 * Full merged OpenAPI document: static management APIs + dynamic SQL paths.
 */
export function buildOpenApiSpec(
  options: BuildOpenApiOptions = {}
): OpenApiObject {
  const spec = getStaticMergedSpec();
  const serverUrl = options.serverUrl || 'http://127.0.0.1:13334';
  spec.servers = [
    {
      url: serverUrl,
      description: 'Current server'
    }
  ];

  const appId = options.appId === undefined ? null : options.appId;
  const records = listAllSqls(appId).filter((r) => r.status === 'enabled');
  const paths = spec.paths as OpenApiObject;
  const tags = (spec.tags as OpenApiObject[]) || [];
  const tagNames = new Set(
    tags
      .map((t) => (typeof t.name === 'string' ? t.name : ''))
      .filter(Boolean)
  );

  for (const record of records) {
    const tag = resolveAppTag(record.app_id);
    if (!tagNames.has(tag)) {
      tags.push({
        name: tag,
        description: `Registered SQL APIs for application ${record.app_id}`
      });
      tagNames.add(tag);
    }

    const { path, method, operation } = buildSqlPathItem(record, { tag });
    if (!paths[path]) {
      paths[path] = {};
    }
    (paths[path] as OpenApiObject)[method] = operation;
  }

  spec.tags = tags;
  return spec;
}

/**
 * Self-contained mini OpenAPI document for a single registered SQL.
 */
export function buildSqlSpec(
  record: SqlRecord,
  options: BuildSqlSpecOptions = {}
): OpenApiObject {
  const staticSpec = getStaticMergedSpec();
  const allComponents = (staticSpec.components || {}) as OpenApiObject;
  const tag = resolveAppTag(record.app_id);
  const { path, method, operation } = buildSqlPathItem(record, { tag });

  const referenced = collectReferencedComponents(operation, allComponents);
  if (!referenced.securitySchemes) {
    referenced.securitySchemes = {};
  }
  const schemes = referenced.securitySchemes as OpenApiObject;
  if (
    !schemes.bearerAuth
    && (allComponents.securitySchemes as OpenApiObject | undefined)?.bearerAuth
  ) {
    schemes.bearerAuth = deepClone(
      (allComponents.securitySchemes as OpenApiObject).bearerAuth
    );
  }

  return {
    openapi: '3.0.3',
    info: {
      title: record.name,
      description:
        record.description
        || `OpenAPI document for SQL API "${record.name}" (${record.sql_type} → ${record.method}).`,
      version: pkg.version || '0.0.1'
    },
    servers: [
      {
        url: options.serverUrl || 'http://127.0.0.1:13334',
        description: 'Current server'
      }
    ],
    tags: [
      {
        name: tag,
        description: `SQL API owned by app ${record.app_id}`
      }
    ],
    security: [{ bearerAuth: [] }],
    paths: {
      [path]: {
        [method]: operation
      }
    },
    components: referenced
  };
}

/** Test helper — clear static cache between tests if needed. */
export function __resetStaticCache(): void {
  cachedStatic = null;
}

// Re-export HttpMethod for consumers that type-check method strings.
export type { HttpMethod };
