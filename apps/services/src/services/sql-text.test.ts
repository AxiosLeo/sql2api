import assert from 'assert';
import {
  extractNamedParams,
  reconcileSqlParams,
  splitSqlStatements
} from './sql-text';

describe('extractNamedParams', () => {
  it('extracts :name placeholders in order', () => {
    assert.deepStrictEqual(
      extractNamedParams(
        'SELECT * FROM t WHERE year = :year AND month = :month'
      ),
      ['year', 'month']
    );
  });

  it('dedupes while preserving first-seen order', () => {
    assert.deepStrictEqual(
      extractNamedParams('SELECT :id, :name WHERE id = :id'),
      ['id', 'name']
    );
  });

  it('skips PostgreSQL :: casts', () => {
    assert.deepStrictEqual(
      extractNamedParams('SELECT :id::int AS n, col::text'),
      ['id']
    );
  });

  it('skips quoted content', () => {
    assert.deepStrictEqual(
      extractNamedParams("SELECT ':not' AS s, :id AS id, \":also_not\""),
      ['id']
    );
  });

  it('returns empty when no placeholders', () => {
    assert.deepStrictEqual(extractNamedParams('SELECT 1'), []);
  });
});

describe('reconcileSqlParams', () => {
  it('keeps AI params that appear in SQL', () => {
    const result = reconcileSqlParams('SELECT * FROM t WHERE id = :id', [
      { name: 'id', rule: 'required|integer', description: '主键' }
    ]);
    assert.deepStrictEqual(result, [
      { name: 'id', rule: 'required|integer', description: '主键', default: undefined }
    ]);
  });

  it('fills missing placeholders with required|string', () => {
    const result = reconcileSqlParams(
      'SELECT * FROM t WHERE year = :year AND month = :month',
      [{ name: 'year', rule: 'required|integer' }]
    );
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], {
      name: 'year',
      rule: 'required|integer',
      description: undefined,
      default: undefined
    });
    assert.deepStrictEqual(result[1], { name: 'month', rule: 'required|string' });
  });

  it('drops params not present in SQL', () => {
    const result = reconcileSqlParams('SELECT * FROM t WHERE id = :id', [
      { name: 'id', rule: 'required|integer' },
      { name: 'extra', rule: 'string' }
    ]);
    assert.deepStrictEqual(result.map((p) => p.name), ['id']);
  });

  it('handles null/empty params', () => {
    assert.deepStrictEqual(
      reconcileSqlParams('SELECT :a, :b', null),
      [
        { name: 'a', rule: 'required|string' },
        { name: 'b', rule: 'required|string' }
      ]
    );
    assert.deepStrictEqual(reconcileSqlParams('SELECT 1', []), []);
  });
});

describe('splitSqlStatements (re-export sanity)', () => {
  it('still splits statements', () => {
    assert.deepStrictEqual(splitSqlStatements('SELECT 1; SELECT 2'), [
      'SELECT 1',
      'SELECT 2'
    ]);
  });
});
