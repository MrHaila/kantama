import { Command } from 'commander';
import { fetchTicketZones } from '../lib/ticketZones';
import { createProgressEmitter } from '../lib/events';
import * as fmt from '../lib/cli-format';

export function register(program: Command): void {
  program
    .command('fetch-ticket-zones')
    .description('Download and generate HSL ticket zone boundaries layer')
    .action(action);
}

export async function action(): Promise<void> {
  const emitter = createProgressEmitter();
  const startTime = Date.now();

  // Header
  console.log('');
  console.log(fmt.header('FETCHING HSL TICKET ZONES', '🎫'));
  console.log('');
  console.log(fmt.dim('  Source: Helsinki Region Infoshare'));
  console.log(fmt.dim('  License: CC BY 4.0'));
  console.log('');

  emitter.on('progress', (event) => {
    if (event.type === 'start') {
      console.log(fmt.infoMessage(event.message || 'Starting...'));
    } else if (event.type === 'progress') {
      if (event.message) console.log(fmt.dim(`  ${event.message}`));
    } else if (event.type === 'complete') {
      console.log(fmt.successMessage(event.message || 'Complete'));
    } else if (event.type === 'error') {
      console.error(fmt.errorMessage(event.message || 'Error'));
      if (event.error) console.error(fmt.dim(`  ${event.error.message}`));
    }
  });

  try {
    await fetchTicketZones(emitter);

    const duration = Date.now() - startTime;

    console.log('');
    console.log(fmt.divider(50));
    console.log(fmt.bold('SUMMARY'));
    console.log(fmt.divider(50));
    console.log(fmt.keyValue('Output:', 'opas/public/layers/ticket-zones.svg', 20));
    console.log(fmt.keyValue('Manifest:', 'Updated', 20));
    console.log(fmt.keyValue('Duration:', fmt.formatDuration(duration), 20));
    console.log('');
    console.log(fmt.successMessage('Ticket zones layer ready!'));
    console.log('');
  } catch (error) {
    console.error('');
    console.error(fmt.errorMessage('Ticket zones fetch failed'));
    console.error(fmt.dim(`  ${error instanceof Error ? error.message : String(error)}`));
    console.error('');
    process.exit(1);
  }
}
