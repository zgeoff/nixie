import { afterAll, afterEach, beforeAll } from 'bun:test';
import { mockServer } from './mock-server';

// Bun runs a preload's beforeAll and afterAll once for each file under `--parallel --no-isolate`,
// and once for the whole run otherwise, so the server starts in the one and stops in the other.
beforeAll(() => {
  mockServer.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  mockServer.resetHandlers();
});

afterAll(() => {
  mockServer.close();
});
