import assert from 'assert';
import { HttpError } from '@axiosleo/koapp';
import { convertNamedParams } from './datasource';

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
