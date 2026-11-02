import { afterAll, afterEach, beforeAll } from 'bun:test';
import { mockServer } from './mock-server';

// Bun runs a preload's beforeAll and afterAll once for each file under `--parallel=N` with two or
// more workers, and once for the whole run under `--parallel=1 --no-isolate`, so the server starts
// in the one and stops in the other.
beforeAll(() => {
  mockServer.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  mockServer.resetHandlers();
});

afterAll(() => {
  mockServer.close();
});
