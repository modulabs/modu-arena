/**
 * @suncreation/modu-arena CLI
 *
 * Track and rank your AI coding tool usage.
 *
 * Usage:
 *   npx @suncreation/modu-arena install --api-key <key>
 *   npx @suncreation/modu-arena rank
 *   npx @suncreation/modu-arena status
 *   npx @suncreation/modu-arena uninstall
 */

import {
  installCommand,
  rankCommand,
  statusCommand,
  submitCommand,
  uninstallCommand,
} from './commands.js';

const args = process.argv.slice(2);
const command = args[0];

function printHelp(): void {
   console.log(`
Modu-Arena — AI Coding Tool Usage Tracker

Usage:
   npx @suncreation/modu-arena <command> [options]

Commands:
   install     Set up hooks for detected AI coding tools
   rank        View your current stats and ranking
   status      Check configuration and installed hooks
   submit      Submit current project for evaluation
   uninstall   Remove all hooks and configuration

Options:
   --api-key <key>   Your Modu-Arena API key (for install)
   --help, -h        Show this help message
   --version, -v     Show version

Examples:
   npx @suncreation/modu-arena install --api-key modu_arena_AbCdEfGh_xxx...
   npx @suncreation/modu-arena rank
   npx @suncreation/modu-arena status
`);
}

async function main(): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    console.log('0.1.0');
    process.exit(0);
  }

  switch (command) {
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
