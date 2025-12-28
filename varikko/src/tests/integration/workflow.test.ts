import { describe, it } from 'vitest';

describe('workflow', () => {
  it.todo('should run full pipeline: fetch zones → geocode → build routes → calculate time buckets');
  it.todo('should run reset workflow: clear data → refetch zones');
  it.todo('should run map workflow: process map → generate SVG');
});
