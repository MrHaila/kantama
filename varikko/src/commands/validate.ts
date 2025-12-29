import { Command } from 'commander';
import { CommandRunner } from '../cli/command-runner';
import { validateData } from '../lib/validate';
import { createProgressEmitter } from '../lib/events';
import * as fmt from '../lib/cli-format';

export function register(program: Command): void {
  program
    .command('validate')
    .description('Validate data integrity and regenerate manifest')
    .action(action);
}

export function action(): void {
  const emitter = createProgressEmitter();

  // Header
  console.log('');
  console.log(fmt.header('VALIDATING DATA', '✓'));
  console.log('');

  emitter.on('progress', (event) => {
    if (event.type === 'start') {
      console.log(fmt.infoMessage('Validating data files...'));
    } else if (event.type === 'progress') {
      if (event.message) console.log(fmt.dim(event.message));
    } else if (event.type === 'complete') {
      console.log(fmt.successMessage(event.message || 'Complete'));
    } else if (event.type === 'error') {
      console.error(fmt.errorMessage(event.message || 'Error'));
      if (event.error) console.error(fmt.dim(`  ${event.error.message}`));
    }
  });

  try {
    const result = validateData({ emitter });

    console.log('');
    console.log(fmt.divider(50));
    console.log(fmt.bold('VALIDATION RESULTS'));
    console.log(fmt.divider(50));
    console.log(
      fmt.keyValue(
        'Status:',
        result.valid ? fmt.success('VALID') : fmt.error('INVALID'),
        20
      )
    );
    console.log(fmt.keyValue('Zones:', result.stats.zones.toLocaleString(), 20));
    console.log(fmt.keyValue('Route files:', result.stats.routeFiles.toLocaleString(), 20));
    console.log(
      fmt.keyValue('Total routes:', result.stats.totalRoutes.toLocaleString(), 20)
    );
    console.log(fmt.keyValue('OK routes:', result.stats.okRoutes.toLocaleString(), 20));
    console.log(
      fmt.keyValue('Pending routes:', result.stats.pendingRoutes.toLocaleString(), 20)
    );
    console.log(fmt.keyValue('Total size:', fmt.formatBytes(result.stats.totalSize), 20));

    if (result.errors.length > 0) {
      console.log('');
      console.log(fmt.header('ERRORS', '⚠️'));
      result.errors.forEach((err) => {
        console.log(fmt.error(`  ${fmt.symbols.bullet} ${err}`));
      });
    }

    if (result.warnings.length > 0) {
      console.log('');
      console.log(fmt.header('WARNINGS', '⚡'));
      result.warnings.slice(0, 5).forEach((warn) => {
        console.log(fmt.warning(`  ${fmt.symbols.bullet} ${warn}`));
      });
      if (result.warnings.length > 5) {
        console.log(fmt.dim(`  ... and ${result.warnings.length - 5} more warnings`));
      }
    }

    console.log('');
    if (result.valid) {
      console.log(fmt.successMessage('Data validation passed!'));
    } else {
      console.log(fmt.errorMessage('Data validation failed'));
    }
    console.log('');
  } catch (error) {
    console.error('');
    console.error(fmt.errorMessage('Validation failed'));
    console.error(
      fmt.dim(`  ${error instanceof Error ? error.message : String(error)}`)
    );
    console.error('');
    process.exit(1);
  }
}
