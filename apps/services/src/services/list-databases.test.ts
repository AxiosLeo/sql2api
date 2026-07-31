import assert from 'assert';
import { listDatabases } from './datasource';
import type { DatasourceConfig } from './datasource';

function baseConfig(
  overrides: Partial<DatasourceConfig> & Pick<DatasourceConfig, 'type'>
): DatasourceConfig {
  return {
    host: '127.0.0.1',
    port: 3306,
    username: 'u',
    password: 'p',
    database: '',
    ...overrides
  };
}

describe('datasource listDatabases', () => {
  it('returns unsupported for oracle without connecting', async () => {
    const result = await listDatabases(
      baseConfig({ type: 'oracle', port: 1521, database: 'ORCL' })
    );
    assert.strictEqual(result.supported, false);
    assert.deepStrictEqual(result.databases, []);
    assert.ok(result.message);
  });

  it('marks mysql-family as supported (connection may fail offline)', async () => {
    const result = await listDatabases(baseConfig({ type: 'mysql' }));
    assert.strictEqual(result.supported, true);
    assert.ok(Array.isArray(result.databases));
    // Offline / refused: empty list with message; live env may return names.
    if (result.databases.length === 0) {
      assert.ok(result.message);
    }
  });

  it('marks sqlserver as supported (connection may fail offline)', async () => {
    const result = await listDatabases(
      baseConfig({ type: 'sqlserver', port: 1433 })
    );
    assert.strictEqual(result.supported, true);
    assert.ok(Array.isArray(result.databases));
  });
});
