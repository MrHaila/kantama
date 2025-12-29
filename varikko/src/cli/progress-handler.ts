/**
 * Standard progress event handler
 */

import { ProgressEvent } from '../lib/events';
import * as fmt from '../lib/cli-format';

export class ProgressHandler {
  constructor(private commandName: string) {}

  getListener(): (event: ProgressEvent) => void {
    return (event) => {
      switch (event.type) {
        case 'start':
          console.log(fmt.infoMessage(event.message || 'Starting...'));
          break;

        case 'progress':
          if (event.message) {
            console.log(fmt.dim(event.message));
          }
          break;

        case 'complete':
          console.log(fmt.successMessage(event.message || 'Complete'));
          break;

        case 'error':
          console.error(fmt.errorMessage(event.message || 'Error'));
          if (event.error) {
            console.error(fmt.dim(`  ${event.error.message}`));
          }
          break;
      }
    };
  }
}
