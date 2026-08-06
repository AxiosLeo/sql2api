import assert from 'assert';
import { HttpError } from '@axiosleo/koapp';
import { splitSqlStatements } from '../../services/sql-text';
import {
  analyzeSql,
  assertMockPayload,
  detectSqlType,
  extractTableNames,
  mergeReviewResults,
  normalizeMockFields,
  parserDatabase,
  replaceNamedParamsForParse,
  staticAuditSql,
  toSqlItem
} from './sql.model';
import type { SqlRecord } from '../../services/sqlite';
import {
  DATASOURCE_PROTOCOLS,
  DATASOURCE_TYPES,
  datasourceProtocol
} from '../../types';

describe('datasource protocol mapping', () => {
  it('maps every DatasourceType to a known protocol', () => {
    const allowed = new Set(['mysql', 'postgresql', 'oracle', 'sqlserver']);
    for (const type of DATASOURCE_TYPES) {
      const protocol = datasourceProtocol(type);
      assert.ok(allowed.has(protocol), `unexpected protocol for ${type}`);
      assert.strictEqual(DATASOURCE_PROTOCOLS[type], protocol);
    }
  });

  it('maps MySQL-family types to mysql protocol', () => {
    for (const type of [
      'mysql',
      'mariadb',
      'tidb',
      'oceanbase',
      'doris',
      'starrocks'
    ] as const) {
      assert.strictEqual(datasourceProtocol(type), 'mysql');
    }
  });

  it('maps PostgreSQL-family types to postgresql protocol', () => {
    for (const type of [
      'postgresql',
      'cockroachdb',
      'yugabytedb',
      'opengauss',
      'kingbase'
    ] as const) {
      assert.strictEqual(datasourceProtocol(type), 'postgresql');
    }
  });

  it('maps oracle and sqlserver to dedicated protocols', () => {
    assert.strictEqual(datasourceProtocol('oracle'), 'oracle');
    assert.strictEqual(datasourceProtocol('sqlserver'), 'sqlserver');
  });
});

describe('parserDatabase', () => {
  it('uses MariaDB parser dialect for mariadb', () => {
    assert.strictEqual(parserDatabase('mariadb'), 'MariaDB');
  });

  it('uses MySQL parser dialect for other MySQL-protocol types', () => {
    assert.strictEqual(parserDatabase('mysql'), 'MySQL');
    assert.strictEqual(parserDatabase('tidb'), 'MySQL');
    assert.strictEqual(parserDatabase('doris'), 'MySQL');
  });

  it('uses PostgresQL parser dialect for PG-protocol types', () => {
    assert.strictEqual(parserDatabase('postgresql'), 'PostgresQL');
    assert.strictEqual(parserDatabase('cockroachdb'), 'PostgresQL');
    assert.strictEqual(parserDatabase('kingbase'), 'PostgresQL');
  });

  it('uses TransactSQL for sqlserver and MySQL best-effort for oracle', () => {
    assert.strictEqual(parserDatabase('sqlserver'), 'TransactSQL');
    assert.strictEqual(parserDatabase('oracle'), 'MySQL');
  });
});

describe('sql.model replaceNamedParamsForParse', () => {
  it('replaces :name with 1', () => {
    assert.strictEqual(
      replaceNamedParamsForParse('SELECT * FROM t WHERE id = :id'),
      'SELECT * FROM t WHERE id = 1'
    );
  });

  it('skips PostgreSQL casts', () => {
    assert.strictEqual(
      replaceNamedParamsForParse('SELECT :id::int AS n'),
      'SELECT 1::int AS n'
    );
  });

  it('skips quoted content', () => {
    assert.strictEqual(
      replaceNamedParamsForParse("SELECT ':not' AS s, :id AS id"),
      "SELECT ':not' AS s, 1 AS id"
    );
  });
});

describe('splitSqlStatements', () => {
  it('splits on top-level semicolons', () => {
    assert.deepStrictEqual(
      splitSqlStatements('SELECT 1; INSERT INTO t (a) VALUES (1)'),
      ['SELECT 1', 'INSERT INTO t (a) VALUES (1)']
    );
  });

  it('ignores semicolons inside strings', () => {
    assert.deepStrictEqual(
      splitSqlStatements("SELECT 'a;b' AS s; SELECT 2"),
      ["SELECT 'a;b' AS s", 'SELECT 2']
    );
  });

  it('ignores semicolons inside line comments', () => {
    assert.deepStrictEqual(
      splitSqlStatements('SELECT 1; -- note; still comment\nSELECT 2'),
      ['SELECT 1', '-- note; still comment\nSELECT 2']
    );
  });

  it('ignores semicolons inside block comments', () => {
    assert.deepStrictEqual(
      splitSqlStatements('SELECT 1; /* a; b */ SELECT 2'),
      ['SELECT 1', '/* a; b */ SELECT 2']
    );
  });

  it('filters empty segments', () => {
    assert.deepStrictEqual(splitSqlStatements('SELECT 1;;;'), ['SELECT 1']);
  });
});

describe('sql.model detectSqlType / analyzeSql', () => {
  it('detects SELECT with named params', () => {
    assert.strictEqual(
      detectSqlType('SELECT id, name FROM users WHERE id = :id', 'mysql'),
      'select'
    );
  });

  it('detects INSERT with named params', () => {
    assert.strictEqual(
      detectSqlType(
        'INSERT INTO users (name, email) VALUES (:name, :email)',
        'mysql'
      ),
      'insert'
    );
  });

  it('detects UPDATE with named params', () => {
    assert.strictEqual(
      detectSqlType(
        'UPDATE users SET name = :name WHERE id = :id',
        'mysql'
      ),
      'update'
    );
  });

  it('detects SELECT for TiDB dialect', () => {
    assert.strictEqual(
      detectSqlType('SELECT id FROM users WHERE id = :id', 'tidb'),
      'select'
    );
  });

  it('detects SELECT for MariaDB dialect', () => {
    assert.strictEqual(
      detectSqlType('SELECT id FROM users WHERE id = :id', 'mariadb'),
      'select'
    );
  });

  it('detects SELECT for CockroachDB dialect', () => {
    assert.strictEqual(
      detectSqlType('SELECT id FROM users WHERE id = :id', 'cockroachdb'),
      'select'
    );
  });

  it('analyzes INSERT for openGauss dialect', () => {
    const analysis = analyzeSql(
      'INSERT INTO users (name) VALUES (:name)',
      'opengauss'
    );
    assert.strictEqual(analysis.sql_type, 'insert');
    assert.strictEqual(analysis.method, 'POST');
  });

  it('detects SELECT for sqlserver dialect', () => {
    assert.strictEqual(
      detectSqlType('SELECT id FROM users WHERE id = :id', 'sqlserver'),
      'select'
    );
  });

  it('detects SELECT for oracle dialect (best-effort parser)', () => {
    assert.strictEqual(
      detectSqlType('SELECT id FROM users WHERE id = :id', 'oracle'),
      'select'
    );
  });

  it('classifies DELETE as complex (blocked by static audit)', () => {
    const analysis = analyzeSql('DELETE FROM users WHERE id = :id', 'mysql');
    assert.strictEqual(analysis.sql_type, 'complex');
    assert.strictEqual(analysis.method, 'POST');
    assert.strictEqual(analysis.statements[0].kind, 'delete');
  });

  it('detects SELECT with WITH CTE', () => {
    assert.strictEqual(
      detectSqlType(
        'WITH cte AS (SELECT 1 AS n) SELECT * FROM cte WHERE n = :n',
        'mysql'
      ),
      'select'
    );
  });

  it('detects SELECT with PostgreSQL ::cast', () => {
    assert.strictEqual(
      detectSqlType('SELECT :id::int AS id FROM users', 'postgresql'),
      'select'
    );
  });

  it('classifies mixed multi-statement as complex/POST', () => {
    const analysis = analyzeSql(
      'SELECT id FROM users WHERE id = :id; UPDATE users SET name = :name WHERE id = :id',
      'mysql'
    );
    assert.strictEqual(analysis.sql_type, 'complex');
    assert.strictEqual(analysis.method, 'POST');
    assert.strictEqual(analysis.statements.length, 2);
  });

  it('classifies same-type multi-statement as complex/POST', () => {
    const analysis = analyzeSql(
      'INSERT INTO t (a) VALUES (:a); INSERT INTO t (a) VALUES (:b)',
      'mysql'
    );
    assert.strictEqual(analysis.sql_type, 'complex');
    assert.strictEqual(analysis.method, 'POST');
  });

  it('classifies CALL as complex/POST', () => {
    const analysis = analyzeSql('CALL refresh_stats(:user_id)', 'mysql');
    assert.strictEqual(analysis.sql_type, 'complex');
    assert.strictEqual(analysis.method, 'POST');
  });

  it('throws on empty SQL', () => {
    assert.throws(
      () => analyzeSql('   ', 'mysql'),
      (err: unknown) =>
        err instanceof HttpError
        && err.status === 400
        && String(err.message).includes('Unable to detect SQL type')
    );
  });
});

describe('sql.model staticAuditSql', () => {
  it('rejects DELETE', () => {
    const analysis = analyzeSql('DELETE FROM users WHERE id = :id', 'mysql');
    const issues = staticAuditSql(analysis);
    assert.ok(issues.some((i) => i.severity === 'error' && /DELETE/i.test(i.message)));
  });

  it('rejects DROP', () => {
    const analysis = analyzeSql('DROP TABLE users', 'mysql');
    const issues = staticAuditSql(analysis);
    assert.ok(issues.some((i) => i.severity === 'error' && /DROP/i.test(i.message)));
  });

  it('rejects TRUNCATE', () => {
    const analysis = analyzeSql('TRUNCATE TABLE users', 'mysql');
    const issues = staticAuditSql(analysis);
    assert.ok(issues.some((i) => i.severity === 'error' && /TRUNCATE/i.test(i.message)));
  });

  it('rejects DELETE embedded in multi-statement script', () => {
    const analysis = analyzeSql(
      'SELECT 1; DELETE FROM users WHERE id = :id',
      'mysql'
    );
    assert.strictEqual(analysis.sql_type, 'complex');
    const issues = staticAuditSql(analysis);
    assert.ok(issues.some((i) => i.severity === 'error' && /DELETE/i.test(i.message)));
  });

  it('rejects DELETE inside CTE main statement', () => {
    const analysis = analyzeSql(
      'WITH doomed AS (SELECT id FROM users) DELETE FROM users WHERE id IN (SELECT id FROM doomed)',
      'mysql'
    );
    const issues = staticAuditSql(analysis);
    assert.ok(issues.some((i) => i.severity === 'error' && /DELETE/i.test(i.message)));
  });

  it('allows SELECT / INSERT / UPDATE', () => {
    for (const sql of [
      'SELECT * FROM users WHERE id = :id',
      'INSERT INTO users (name) VALUES (:name)',
      'UPDATE users SET name = :name WHERE id = :id'
    ]) {
      const issues = staticAuditSql(analyzeSql(sql, 'mysql'));
      assert.strictEqual(issues.length, 0, sql);
    }
  });

  it('allows complex SELECT+INSERT without forbidden ops', () => {
    const analysis = analyzeSql(
      'INSERT INTO logs (msg) VALUES (:msg); SELECT LAST_INSERT_ID() AS id',
      'mysql'
    );
    assert.strictEqual(analysis.sql_type, 'complex');
    assert.strictEqual(staticAuditSql(analysis).length, 0);
  });
});

describe('sql.model extractTableNames', () => {
  it('extracts FROM table', () => {
    const tables = extractTableNames(
      'SELECT * FROM water_statistics WHERE year = :year',
      'mysql'
    );
    assert.ok(tables.includes('water_statistics'));
  });

  it('extracts JOIN tables', () => {
    const tables = extractTableNames(
      'SELECT u.id FROM users u JOIN orders o ON o.user_id = u.id WHERE u.id = :id',
      'mysql'
    );
    assert.ok(tables.includes('users'));
    assert.ok(tables.includes('orders'));
  });

  it('extracts INSERT INTO table', () => {
    const tables = extractTableNames(
      'INSERT INTO users (name) VALUES (:name)',
      'mysql'
    );
    assert.ok(tables.includes('users'));
  });

  it('extracts UPDATE table', () => {
    const tables = extractTableNames(
      'UPDATE users SET name = :name WHERE id = :id',
      'mysql'
    );
    assert.ok(tables.includes('users'));
  });
});

describe('sql.model mergeReviewResults', () => {
  it('passes when only warnings present', () => {
    const result = mergeReviewResults(
      [{ severity: 'warning', message: 'slow query' }],
      { passed: true, issues: [] }
    );
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.issues.length, 1);
  });

  it('fails when any error issue present', () => {
    const result = mergeReviewResults(
      [{ severity: 'error', message: 'DROP not allowed' }],
      { passed: true, issues: [] }
    );
    assert.strictEqual(result.passed, false);
  });

  it('treats empty AI veto as pass with no extra issues', () => {
    const result = mergeReviewResults([], {
      passed: false,
      issues: []
    });
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.issues.length, 0);
  });

  it('ignores AI passed=false when no error issues', () => {
    const result = mergeReviewResults([], {
      passed: false,
      issues: [{ severity: 'warning', message: 'consider index' }]
    });
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.issues.length, 1);
  });
});

describe('normalizeMockFields / assertMockPayload', () => {
  it('serializes plain mock_data objects', () => {
    const result = normalizeMockFields({
      mock_enabled: true,
      mock_data: { rows: [{ id: 1 }], row_count: 1 }
    });
    assert.ok(result);
    assert.strictEqual(result!.mock_enabled, true);
    assert.strictEqual(
      result!.mock_data_json,
      JSON.stringify({ rows: [{ id: 1 }], row_count: 1 })
    );
  });

  it('rejects array or null mock_data', () => {
    assert.strictEqual(
      normalizeMockFields({ mock_enabled: true, mock_data: [] }),
      null
    );
    assert.strictEqual(
      normalizeMockFields({ mock_enabled: true, mock_data: null }),
      null
    );
  });

  it('allows enabling only when payload is a JSON object', () => {
    assert.strictEqual(assertMockPayload(true, '{}'), true);
    assert.strictEqual(assertMockPayload(true, '[]'), false);
    assert.strictEqual(assertMockPayload(true, 'not-json'), false);
    assert.strictEqual(assertMockPayload(false, 'not-json'), true);
  });
});

describe('toSqlItem mock fields', () => {
  it('maps mock_enabled and mock_data from the record', () => {
    const record: SqlRecord = {
      id: 'sql-1',
      app_id: 'app-1',
      connection_id: 'conn-1',
      name: 'get-user',
      description: '',
      sql_text: 'SELECT 1',
      sql_type: 'select',
      method: 'GET',
      params_json: '[]',
      status: 'enabled',
      review_json: '{"passed":true,"issues":[]}',
      mock_enabled: 1,
      mock_data_json: '{"rows":[{"id":1}],"row_count":1}',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    };
    const item = toSqlItem(record);
    assert.strictEqual(item.mock_enabled, true);
    assert.deepStrictEqual(item.mock_data, {
      rows: [{ id: 1 }],
      row_count: 1
    });
  });
});
