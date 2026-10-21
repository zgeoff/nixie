import { afterAll, afterEach } from 'bun:test';
import { githubStore } from './github-store';
import { server } from './node';

// Two MSW servers in one process break each other's interception, so each test file runs in its
// own process.
server.listen({ onUnhandledRequest: 'error' });

afterEach(() => {
  server.resetHandlers();
  githubStore.reset();
});

afterAll(() => {
  server.close();
});
