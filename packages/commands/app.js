'use strict';

const { Command, printer } = require('@axiosleo/cli-tool');

/**
 * Application management: create / list / remove apps.
 * Usage:
 *   sql2api app create --name my-app [--desc "..."]
 *   sql2api app list
 *   sql2api app remove --name my-app
 *
 * Stub: prints planned actions. Real SQLite persistence lands later.
 */
class AppCommand extends Command {
  constructor() {
    super({
      name: 'app',
      desc: 'Manage applications (create / list / remove)'
    });
    this.addArgument('action', 'Action: create | list | remove', 'required', null);
    this.addOption('name', 'n', 'Application name', 'optional', null);
    this.addOption('desc', 'd', 'Application description', 'optional', '');
  }

  /**
   * @param {{ action: string }} args
   * @param {{ name?: string, desc?: string }} options
   */
  async exec(args, options) {
    const action = (args.action || '').toLowerCase();

    switch (action) {
      case 'create': {
        if (!options.name) {
          printer.red('Error: --name is required for create').println();
          return;
        }
        const stubId = 'stub-app-id';
        printer.green('Application created (stub)').println();
        printer.println(`  id:   ${stubId}`);
        printer.println(`  name: ${options.name}`);
        printer.println(`  desc: ${options.desc || ''}`);
        break;
      }
      case 'list': {
        printer.yellow('Applications (stub):').println();
        printer.println('  stub-app-id  stub-app  active');
        break;
      }
      case 'remove': {
        if (!options.name) {
          printer.red('Error: --name is required for remove').println();
          return;
        }
        printer.yellow(`Remove application "${options.name}"? (stub — not deleted)`).println();
        printer.println('  Confirm interactively in a later iteration.');
        break;
      }
      default:
        printer.red(`Unknown action: ${action}`).println();
        printer.println('Usage: sql2api app <create|list|remove> [--name <name>] [--desc <desc>]');
    }
  }
}

module.exports = AppCommand;
