/**
 * @suncreation/modu-arena CLI
 *
 * Track and rank your AI coding tool usage.
 *
 * Usage:
 *   npx @suncreation/modu-arena register
 *   npx @suncreation/modu-arena login
 *   npx @suncreation/modu-arena rank
 *   npx @suncreation/modu-arena status
 *   npx @suncreation/modu-arena uninstall
 */

declare const PKG_VERSION: string;

import {
  installCommand,
  loginCommand,
  rankCommand,
  registerCommand,
  statusCommand,
  submitCommand,
  uninstallCommand,
  daemonInstallCommand,
  daemonUninstallCommand,
  daemonStatusCommand,
  daemonSyncCommand,
} from './commands.js';

const args = process.argv.slice(2);
const command = args[0];

function printHelp(): void {
   console.log(`
Modu-Arena — AI Coding Tool Usage Tracker

Usage:
   npx @suncreation/modu-arena <command> [options]

Commands:
   register       Create a new account (interactive)
   login          Log in to an existing account (interactive)
   install        Set up hooks for detected AI coding tools
   rank           View your current stats and ranking
   status         Check configuration and installed hooks
   submit         Submit current project for evaluation
   uninstall      Remove all hooks and configuration
   daemon-install Install Claude Desktop sync daemon
   daemon-status  Check daemon status
   daemon-sync    Manually sync Claude Desktop data
   daemon-remove  Remove the daemon

Options:
   --api-key <key>   Your Modu-Arena API key (for install)
   --help, -h        Show this help message
   --version, -v     Show version

Examples:
   npx @suncreation/modu-arena register
   npx @suncreation/modu-arena login
   npx @suncreation/modu-arena install --api-key modu_arena_AbCdEfGh_xxx...
   npx @suncreation/modu-arena rank
   npx @suncreation/modu-arena daemon-install
`);
}

async function main(): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    console.log(PKG_VERSION);
    process.exit(0);
  }

  switch (command) {
    case 'register':
      await registerCommand();
      break;
    case 'login':
      await loginCommand();
      break;
    case 'install': {
      const keyIndex = args.indexOf('--api-key');
      const apiKey = keyIndex >= 0 ? args[keyIndex + 1] : undefined;
      await installCommand(apiKey);
      break;
    }
    case 'rank':
      await rankCommand();
      break;
    case 'status':
      statusCommand();
      break;
    case 'submit':
      await submitCommand();
      break;
    case 'uninstall':
      uninstallCommand();
      break;
    case 'daemon-install':
      daemonInstallCommand();
      break;
    case 'daemon-uninstall':
    case 'daemon-remove':
      daemonUninstallCommand();
      break;
    case 'daemon-status':
      daemonStatusCommand();
      break;
    case 'daemon-sync':
      await daemonSyncCommand();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
