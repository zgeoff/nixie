import { afterAll, afterEach } from 'bun:test';
import { githubStore } from './github-store';
import { server } from './node';

// Starts the mock GitHub for the test file that imports it, and resets its handlers and store after
// each test. `bun run test` runs each file in its own process, so it never shares a process with
// the web client's mock API: two MSW servers in one process break each other's interception.
server.listen({ onUnhandledRequest: 'error' });

afterEach(() => {
  server.resetHandlers();
  githubStore.reset();
});

afterAll(() => {
  server.close();
});
