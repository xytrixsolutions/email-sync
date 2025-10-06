#!/usr/bin/env node

import { Command } from 'commander';
import { version } from '../package.json';

const program = new Command();

program
  .name('email-sync')
  .description('A CLI tool for email synchronization')
  .version(version)
  .showHelpAfterError('(add --help for additional information)');

program
  .command('sync')
  .description('Sync emails')
  .action(() => {
    console.log('Syncing emails...');
    // TODO: Implement sync functionality
  });

program.parse(process.argv);

// Show help if no arguments are provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
