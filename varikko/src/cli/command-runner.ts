/**
 * Command execution pattern abstraction
 */

import { CommandConfig } from './types';
import { ProgressHandler } from './progress-handler';
import { createProgressEmitter, ProgressEmitter } from '../lib/events';
import * as fmt from '../lib/cli-format';

export class CommandRunner<TOptions, TResult> {
  constructor(private config: CommandConfig) {}

  async run(
    options: TOptions,
    handler: (opts: TOptions, emitter: ProgressEmitter) => Promise<TResult>,
    formatter: (result: TResult, duration: number) => void
  ): Promise<void> {
    const emitter = createProgressEmitter();
    const startTime = Date.now();

    // Header
    console.log('');
    console.log(fmt.header(this.config.title, this.config.emoji));
    console.log('');

    if (this.config.headerInfo) {
      for (const [key, value] of Object.entries(this.config.headerInfo)) {
        console.log(fmt.keyValue(key + ':', value, 15));
      }
      console.log('');
    }

    // Standard progress
    const progressHandler = new ProgressHandler(this.config.title);
    emitter.on('progress', progressHandler.getListener());

    try {
      const result = await handler(options, emitter);
      const duration = Date.now() - startTime;
      formatter(result, duration);
    } catch (error) {
      console.error('');
      console.error(fmt.errorMessage(`${this.config.title} failed`));
      console.error(
        fmt.dim(`  ${error instanceof Error ? error.message : String(error)}`)
      );
      console.error('');
      process.exit(1);
    }
  }
}
