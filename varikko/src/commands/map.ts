import { Command } from 'commander';
import { CommandRunner } from '../cli/command-runner';
import { processMaps } from '../lib/maps';
import * as fmt from '../lib/cli-format';

export function register(program: Command): void {
  program
    .command('map')
    .description('Process shapefiles and generate SVG')
    .action(action);
}

export async function action(): Promise<void> {
  const runner = new CommandRunner<Record<string, never>, Record<string, never>>({
    title: 'PROCESSING MAPS',
    emoji: '🗺️',
    headerInfo: {
      Source: 'data/maastokartta_esri/',
      Output: 'TopoJSON + SVG layers',
    },
  });

  await runner.run(
    {},
    async (_, emitter) => {
      await processMaps({ emitter });
      return {}; // processMaps doesn't return a value
    },
    (_, duration) => {
      console.log('');
      console.log(fmt.divider(50));
      console.log(fmt.bold('FILES CREATED'));
      console.log(fmt.divider(50));
      console.log(fmt.successMessage('background_map.json (TopoJSON)'));
      console.log(fmt.successMessage('layers/water.svg'));
      console.log(fmt.successMessage('layers/roads.svg'));
      console.log(fmt.successMessage('layers/railways.svg'));
      console.log(fmt.successMessage('layers/manifest.json'));
      console.log('');
      console.log(fmt.keyValue('Duration:', fmt.formatDuration(duration), 15));
      console.log('');
      console.log(fmt.successMessage('Map layers ready for visualization'));
      console.log('');
    }
  );
}
