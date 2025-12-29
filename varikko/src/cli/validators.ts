/**
 * CLI validation helpers
 */

import * as fmt from '../lib/cli-format';

export function validatePeriod(period: string): 'MORNING' | 'EVENING' | 'MIDNIGHT' {
  const validPeriods = ['MORNING', 'EVENING', 'MIDNIGHT'] as const;
  const normalized = period.toUpperCase();

  if (!validPeriods.includes(normalized as any)) {
    console.error('');
    console.error(fmt.errorMessage(`Invalid period: ${period}`));
    console.error(fmt.dim(`  Valid periods: ${validPeriods.join(', ')}`));
    console.error('');
    process.exit(1);
  }

  return normalized as 'MORNING' | 'EVENING' | 'MIDNIGHT';
}

export function validateTransportMode(mode: string): 'WALK' | 'BICYCLE' {
  const validModes = ['WALK', 'BICYCLE'] as const;
  const normalized = mode.toUpperCase();

  if (!validModes.includes(normalized as any)) {
    console.error('');
    console.error(fmt.errorMessage(`Invalid transport mode: ${mode}`));
    console.error(fmt.dim(`  Valid modes: ${validModes.join(', ')}`));
    console.error('');
    process.exit(1);
  }

  return normalized as 'WALK' | 'BICYCLE';
}
