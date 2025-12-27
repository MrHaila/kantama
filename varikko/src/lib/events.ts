import { EventEmitter } from 'eventemitter3';

export type WorkflowStage =
  | 'fetch_zones'
  | 'geocode_zones'
  | 'build_routes'
  | 'clear_data'
  | 'calculate_deciles'
  | 'export_routes'
  | 'process_map'
  | 'generate_svg';

export interface ProgressEvent {
  stage: WorkflowStage;
  type: 'start' | 'progress' | 'complete' | 'error';
  current?: number;
  total?: number;
  message?: string;
  error?: Error;
  metadata?: Record<string, any>;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export class ProgressEmitter extends EventEmitter<{
  progress: (event: ProgressEvent) => void;
}> {
  emitStart(stage: WorkflowStage, total?: number, message?: string) {
    this.emit('progress', { stage, type: 'start', total, message });
  }

  emitProgress(stage: WorkflowStage, current: number, total: number, message?: string) {
    this.emit('progress', { stage, type: 'progress', current, total, message });
  }

  emitComplete(stage: WorkflowStage, message?: string, metadata?: Record<string, any>) {
    this.emit('progress', { stage, type: 'complete', message, metadata });
  }

  emitError(stage: WorkflowStage, error: Error, message?: string) {
    this.emit('progress', { stage, type: 'error', error, message });
  }
}

/**
 * Create a progress emitter for a workflow
 */
export function createProgressEmitter(): ProgressEmitter {
  return new ProgressEmitter();
}
