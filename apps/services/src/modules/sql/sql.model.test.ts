import assert from 'assert';
import { HttpError } from '@axiosleo/koapp';
import { detectSqlType, replaceNamedParamsForParse } from './sql.model';

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

describe('sql.model detectSqlType', () => {
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

  it('detects DELETE with named params', () => {
    assert.strictEqual(
      detectSqlType('DELETE FROM users WHERE id = :id', 'mysql'),
      'delete'
    );
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

  it('rejects multiple statements', () => {
    assert.throws(
      () => detectSqlType('SELECT 1; SELECT 2', 'mysql'),
      (err: unknown) =>
        err instanceof HttpError
        && err.status === 400
        && String(err.message).includes('single SQL statement')
    );
  });

  it('rejects unsupported types like DROP', () => {
    assert.throws(
      () => detectSqlType('DROP TABLE users', 'mysql'),
      (err: unknown) =>
        err instanceof HttpError
        && err.status === 400
        && String(err.message).includes('Unsupported SQL type')
    );
  });
});
