#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './tui/app';
import { parseCLI } from './cli';

// Graceful shutdown on Ctrl+C
process.on('SIGINT', () => {
  if (process.env.TUI_MODE === 'true') {
    // In TUI mode, let Ink handle cleanup
    process.exit(0);
  } else {
    console.log('\nOperation cancelled by user');
    process.exit(130); // Standard exit code for SIGINT
  }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  if (process.env.TUI_MODE === 'true') {
    // In TUI mode, show clean error message without stack trace
    console.error('\nFatal error:', error.message);
  } else {
    console.error('Fatal error:', error);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  if (process.env.TUI_MODE === 'true') {
    // In TUI mode, show clean error message
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error('\nUnhandled error:', message);
  } else {
    console.error('Unhandled rejection:', reason);
  }
  process.exit(1);
});

async function main() {
  const command = await parseCLI();

  if (!command) {
    // Interactive mode - launch TUI
    process.env.TUI_MODE = 'true';
    render(React.createElement(App));
  }
  // CLI commands execute during parseCLI() via Commander actions
}

main().catch((error) => {
  if (process.env.TUI_MODE === 'true') {
    console.error('\nFatal error:', error.message || error);
  } else {
    console.error('Fatal error:', error);
  }
  process.exit(1);
});
