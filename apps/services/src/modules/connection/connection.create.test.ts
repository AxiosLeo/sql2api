import assert from 'assert';
import Validator from 'validatorjs';
import { createConnectionRules } from './connection.model';

describe('createConnectionRules', () => {
  it('accepts create body with password', () => {
    const v = new Validator(
      {
        name: 'local-mysql',
        type: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        username: 'root',
        password: 'secret',
        database: 'demo'
      },
      createConnectionRules
    );
    assert.strictEqual(v.passes(), true);
  });

  it('accepts create body with copy_password_from and no password', () => {
    const v = new Validator(
      {
        name: 'local-mysql-copy',
        type: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        username: 'root',
        database: 'demo2',
        copy_password_from: 'bebb53ad-0ead-4719-a5f2-012b5529e75f',
        app_id: 'app-1'
      },
      createConnectionRules
    );
    assert.strictEqual(v.passes(), true);
  });

  it('rejects missing name', () => {
    const v = new Validator(
      {
        type: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        username: 'root',
        password: 'secret',
        database: 'demo'
      },
      createConnectionRules
    );
    assert.strictEqual(v.fails(), true);
  });
});
