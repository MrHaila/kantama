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
  commands.simplifyRoutes.register(program);
  commands.status.register(program);

  // Zones subcommands
  const zonesCommand = program
    .command('zones')
    .description('Zone data management');

  zonesCommand
    .command('list')
    .description('List all zones with metadata')
    .option('-l, --limit <count>', 'Limit number of zones to display', parseInt)
    .action((options) => {
      const zonesData = readZones();

      if (!zonesData || zonesData.zones.length === 0) {
        console.log('');
        console.log(fmt.warningMessage('No zones available'));
        console.log(fmt.dim('  Run \'varikko fetch\' to fetch postal code zones'));
        console.log('');
        return;
      }

      const zones = options.limit ? zonesData.zones.slice(0, options.limit) : zonesData.zones;
      const totalZones = zonesData.zones.length;

      // Header
      console.log('');
      console.log(fmt.header('ZONES', '📍'));
      console.log('');
      console.log(fmt.keyValue('Total zones:', totalZones, 15));
      if (options.limit) {
        console.log(fmt.keyValue('Showing:', `${zones.length} zones (limited)`, 15));
      }
      console.log('');

      // Format zones as table
      const tableData = zones.map(zone => ({
        id: zone.id,
        name: zone.name,
        city: zone.city,
        lat: zone.routingPoint[0].toFixed(6),
        lon: zone.routingPoint[1].toFixed(6),
      }));

      const output = fmt.table(tableData, [
        { header: 'ID', key: 'id', width: 12 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'City', key: 'city', width: 12 },
        { header: 'Latitude', key: 'lat', align: 'right', width: 10 },
        { header: 'Longitude', key: 'lon', align: 'right', width: 10 },
      ]);

      console.log(output);
      console.log('');

      if (options.limit && options.limit < totalZones) {
        console.log(fmt.muted(`  ... and ${totalZones - options.limit} more zones`));
        console.log(fmt.dim(`  Use --limit to see more or omit to see all`));
        console.log('');
      }
    });

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
