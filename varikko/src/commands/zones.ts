import { Command } from 'commander';
import { readZones } from '../lib/datastore';
import * as fmt from '../lib/cli-format';

export function register(program: Command): void {
  const zonesCommand = program
    .command('zones')
    .description('Zone data management');

  zonesCommand
    .command('list')
    .description('List all zones with metadata')
    .option('-l, --limit <count>', 'Limit number of zones to display', parseInt)
    .action(listAction);
}

export function listAction(options: { limit?: number }): void {
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
}
