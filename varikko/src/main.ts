#!/usr/bin/env node
import { config } from 'dotenv';
import { parseCLI } from './cli';

// Load .env from parent directory
config({ path: '../.env' });

// Graceful shutdown on Ctrl+C
process.on('SIGINT', () => {
  console.log('\nOperation cancelled by user');
  process.exit(130); // Standard exit code for SIGINT
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

async function main() {
  // Parse and execute CLI commands
  await parseCLI();
  // All commands execute via Commander actions
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
