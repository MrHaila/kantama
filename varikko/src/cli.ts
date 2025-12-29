import { Command } from 'commander';
import * as commands from './commands';

export interface CLIOptions {
  interactive: boolean;
  test: boolean;
  period?: 'MORNING' | 'EVENING' | 'MIDNIGHT';
  force?: boolean;
}

export interface CLICommand {
  command: string;
  options: CLIOptions;
}

export async function parseCLI(): Promise<CLICommand | null> {
  const program = new Command();

  program
    .name('varikko')
    .description('Varikko Data Pipeline - CLI for transit route calculation')
    .version('3.0.0');

  // Default (no subcommand) → show status
  program.action(() => {
    commands.status.action();
  });

  // Register commands
  commands.fetch.register(program);
  commands.geocode.register(program);
  commands.routes.register(program);
  commands.timeBuckets.register(program);
  commands.validate.register(program);
  commands.map.register(program);
  commands.reachability.register(program);
  commands.transitLayer.register(program);
  commands.status.register(program);

  await program.parseAsync();

  // All commands now execute via Commander actions
  // Return a dummy command to indicate execution completed
  const options = program.opts();
  const [command] = program.args;

  return {
    command: command || 'status', // Default command is status
    options: options as CLIOptions,
  };
}
