import { describe, it, expect } from 'vitest';
import { createProgressEmitter } from '../../lib/events';

describe('progress emitter', () => {
  it('should emit start event', () => {
    return new Promise<void>((resolve) => {
      const emitter = createProgressEmitter();

      emitter.on('progress', (event) => {
        expect(event.type).toBe('start');
        expect(event.stage).toBe('fetch_zones');
        resolve();
      });

      emitter.emitStart('fetch_zones', 100, 'Fetching zones...');
    });
  });

  it('should emit progress event', () => {
    return new Promise<void>((resolve) => {
      const emitter = createProgressEmitter();

      emitter.on('progress', (event) => {
        expect(event.type).toBe('progress');
        expect(event.current).toBe(50);
        expect(event.total).toBe(100);
        resolve();
      });

      emitter.emitProgress('fetch_zones', 50, 100);
    });
  });

  it('should emit complete event', () => {
    return new Promise<void>((resolve) => {
      const emitter = createProgressEmitter();

      emitter.on('progress', (event) => {
        expect(event.type).toBe('complete');
        resolve();
      });

      emitter.emitComplete('fetch_zones', 'Done!');
    });
  });
});
