import { describe, it } from 'vitest';

describe('geocoding', () => {
  it.todo('should geocode single zone (mock API)');
  it.todo('should fallback strategies (postal → name → postal+Helsinki)');
  it.todo('should fallback to geometric centroid on failure');
  it.todo('should rate limit (100ms between requests)');
  it.todo('should update database with routing coords');
});
