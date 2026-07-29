'use strict';

const crypto = require('crypto');
const { Command, printer } = require('@axiosleo/cli-tool');

/**
 * Api-Key management for an application.
 * Usage:
 *   sql2api apikey create --app <app_id> [--name "default"]
 *   sql2api apikey list --app <app_id>
 *   sql2api apikey revoke --app <app_id> --name <key_name>
 *
 * Key format: sk2a_<40 hex chars>. Only shown in plaintext once on create.
 * Stub: prints generated key; real SHA-256 storage lands later.
 */
class ApiKeyCommand extends Command {
  constructor() {
    super({
      name: 'apikey',
      desc: 'Manage application Api-Keys (create / list / revoke)'
    });
    this.addArgument('action', 'Action: create | list | revoke', 'required', null);
    this.addOption('app', 'a', 'Application id', 'required', null);
    this.addOption('name', 'n', 'Api-Key name', 'optional', 'default');
  }

  /**
   * @param {{ action: string }} args
   * @param {{ app: string, name?: string }} options
   */
  async exec(args, options) {
    const action = (args.action || '').toLowerCase();
    const appId = options.app;
    const name = options.name || 'default';

    if (!appId) {
      printer.red('Error: --app is required').println();
      return;
    }

    switch (action) {
      case 'create': {
        const token = `sk2a_${crypto.randomBytes(20).toString('hex')}`;
        const prefix = token.slice(0, 12);
        const hash = crypto.createHash('sha256').update(token).digest('hex');

        printer.green('Api-Key created (stub)').println();
        printer.println(`  app:    ${appId}`);
        printer.println(`  name:   ${name}`);
        printer.println(`  prefix: ${prefix}`);
        printer.println(`  hash:   ${hash.slice(0, 16)}…`);
        printer.yellow('  token (shown once): ').print(token).println();
        printer.warning('Store this token securely. It will not be shown again.');
        break;
      }
      case 'list': {
        printer.yellow(`Api-Keys for app ${appId} (stub):`).println();
        printer.println('  stub-key-id  default  sk2a_stub…  active');
        break;
      }
      case 'revoke': {
        printer.yellow(`Revoke Api-Key "${name}" for app ${appId}? (stub — not revoked)`).println();
        break;
      }
      default:
        printer.red(`Unknown action: ${action}`).println();
        printer.println('Usage: sql2api apikey <create|list|revoke> --app <app_id> [--name <name>]');
    }
  }
}

module.exports = ApiKeyCommand;
