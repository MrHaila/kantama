#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './tui/app';
import { parseCLI } from './cli';

async function main() {
  const command = parseCLI();

  if (!command) {
    // Interactive mode - launch TUI
    process.env.TUI_MODE = 'true';
    render(React.createElement(App));
  } else {
    // Non-interactive mode - execute command
    console.log(`Non-interactive mode not yet implemented: ${command.command}`);
    console.log('Use interactive mode by running "varikko" with no arguments.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
