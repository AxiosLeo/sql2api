import assert from 'assert';
import { HttpError } from '@axiosleo/koapp';
import { adapters, convertNamedParams, convertNamedParamsToAt } from './datasource';
import { DATASOURCE_TYPES, datasourceProtocol } from '../types';

describe('datasource adapters registry', () => {
  it('registers an adapter for every DatasourceType', () => {
    for (const type of DATASOURCE_TYPES) {
      assert.ok(adapters[type], `missing adapter for ${type}`);
      assert.strictEqual(typeof adapters[type].testConnection, 'function');
      assert.strictEqual(typeof adapters[type].listTables, 'function');
      assert.strictEqual(typeof adapters[type].describeTables, 'function');
      assert.strictEqual(typeof adapters[type].query, 'function');
      assert.strictEqual(typeof adapters[type].execute, 'function');
      assert.strictEqual(typeof adapters[type].executeScript, 'function');
    }
  });

  it('shares protocol adapters within each protocol family', () => {
    assert.strictEqual(adapters.mysql, adapters.tidb);
    assert.strictEqual(adapters.mysql, adapters.mariadb);
    assert.strictEqual(adapters.postgresql, adapters.cockroachdb);
    assert.strictEqual(adapters.postgresql, adapters.opengauss);
    assert.strictEqual(adapters.oracle, adapters.oracle);
    assert.strictEqual(adapters.sqlserver, adapters.sqlserver);
    assert.notStrictEqual(adapters.mysql, adapters.postgresql);
    assert.notStrictEqual(adapters.oracle, adapters.mysql);
    assert.notStrictEqual(adapters.sqlserver, adapters.postgresql);
    assert.notStrictEqual(adapters.oracle, adapters.sqlserver);
  });

  it('protocol helper matches adapter family', () => {
    assert.strictEqual(datasourceProtocol('doris'), 'mysql');
    assert.strictEqual(datasourceProtocol('yugabytedb'), 'postgresql');
    assert.strictEqual(datasourceProtocol('oracle'), 'oracle');
    assert.strictEqual(datasourceProtocol('sqlserver'), 'sqlserver');
  });
});

describe('datasource convertNamedParams', () => {
  it('converts single named param', () => {
    const { text, values } = convertNamedParams(
      'SELECT * FROM users WHERE id = :id',
      { id: 42 }
    );
    assert.strictEqual(text, 'SELECT * FROM users WHERE id = $1');
    assert.deepStrictEqual(values, [42]);
  });

  it('reuses index for repeated param names', () => {
    const { text, values } = convertNamedParams(
      'SELECT * FROM t WHERE a = :x OR b = :x',
      { x: 'v' }
    );
    assert.strictEqual(text, 'SELECT * FROM t WHERE a = $1 OR b = $1');
    assert.deepStrictEqual(values, ['v']);
  });

  it('skips PostgreSQL type casts', () => {
    const { text, values } = convertNamedParams(
      'SELECT :id::int AS n',
      { id: 7 }
    );
    assert.strictEqual(text, 'SELECT $1::int AS n');
    assert.deepStrictEqual(values, [7]);
  });

  it('skips content inside single quotes', () => {
    const { text, values } = convertNamedParams(
      "SELECT ':not_a_param' AS s, :id AS id",
      { id: 1 }
    );
    assert.strictEqual(text, "SELECT ':not_a_param' AS s, $1 AS id");
    assert.deepStrictEqual(values, [1]);
  });

  it('skips content inside double quotes', () => {
    const { text, values } = convertNamedParams(
      'SELECT ":col" FROM t WHERE id = :id',
      { id: 3 }
    );
    assert.strictEqual(text, 'SELECT ":col" FROM t WHERE id = $1');
    assert.deepStrictEqual(values, [3]);
  });

  it('throws HttpError when param is missing', () => {
    assert.throws(
      () => convertNamedParams('SELECT :missing', {}),
      (err: unknown) => err instanceof HttpError && err.status === 400
    );
  });

  it('handles multiple distinct params', () => {
    const { text, values } = convertNamedParams(
      'UPDATE users SET name = :name WHERE id = :id',
      { name: 'alice', id: 9 }
    );
    assert.strictEqual(text, 'UPDATE users SET name = $1 WHERE id = $2');
    assert.deepStrictEqual(values, ['alice', 9]);
  });
});

describe('datasource convertNamedParamsToAt', () => {
  it('converts :name to @name', () => {
    const { text, names } = convertNamedParamsToAt(
      'SELECT * FROM users WHERE id = :id',
      { id: 42 }
    );
    assert.strictEqual(text, 'SELECT * FROM users WHERE id = @id');
    assert.deepStrictEqual(names, ['id']);
  });

  it('dedupes names while rewriting all occurrences', () => {
    const { text, names } = convertNamedParamsToAt(
      'SELECT * FROM t WHERE a = :x OR b = :x',
      { x: 'v' }
    );
    assert.strictEqual(text, 'SELECT * FROM t WHERE a = @x OR b = @x');
    assert.deepStrictEqual(names, ['x']);
  });

  it('skips quoted content and brackets', () => {
    const { text, names } = convertNamedParamsToAt(
      "SELECT ':not' AS s, [col:x] AS c, :id AS id",
      { id: 1 }
    );
    assert.strictEqual(text, "SELECT ':not' AS s, [col:x] AS c, @id AS id");
    assert.deepStrictEqual(names, ['id']);
  });

  it('throws HttpError when param is missing', () => {
    assert.throws(
      () => convertNamedParamsToAt('SELECT :missing', {}),
      (err: unknown) => err instanceof HttpError && err.status === 400
    );
  });
});
