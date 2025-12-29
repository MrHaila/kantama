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
