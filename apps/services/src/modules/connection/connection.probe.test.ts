import assert from 'assert';
import Validator from 'validatorjs';
import { probeConnectionRules } from './connection.model';

describe('probeConnectionRules', () => {
  it('accepts probe body with password', () => {
    const v = new Validator(
      {
        type: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        username: 'root',
        password: 'secret',
        action: 'test'
      },
      probeConnectionRules
    );
    assert.strictEqual(v.passes(), true);
  });

  it('accepts probe body with connection_id and no password', () => {
    const v = new Validator(
      {
        type: 'postgresql',
        host: '127.0.0.1',
        port: 5432,
        username: 'pg',
        connection_id: 'bebb53ad-0ead-4719-a5f2-012b5529e75f',
        action: 'databases'
      },
      probeConnectionRules
    );
    assert.strictEqual(v.passes(), true);
  });

  it('rejects invalid action', () => {
    const v = new Validator(
      {
        type: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        username: 'root',
        password: 'x',
        action: 'drop'
      },
      probeConnectionRules
    );
    assert.strictEqual(v.fails(), true);
  });

  it('rejects unknown datasource type', () => {
    const v = new Validator(
      {
        type: 'redis',
        host: '127.0.0.1',
        port: 6379,
        username: 'u',
        password: 'x'
      },
      probeConnectionRules
    );
    assert.strictEqual(v.fails(), true);
  });
});
