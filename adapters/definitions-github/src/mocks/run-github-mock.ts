import { afterAll, afterEach } from 'bun:test';
import { githubAPIURL } from './github-api-url';
import { githubStore } from './github-store';
import { server } from './node';

// Two MSW servers in one process break each other's interception, so each test file runs in its
// own process. The root preload's web client server sees every request too, so this one refuses
// only the requests to its own host and leaves loopback calls, such as a test's to nixie, to it.
server.listen({
  onUnhandledRequest: (request, print) => {
    if (new URL(request.url).origin === new URL(githubAPIURL).origin) {
      print.error();
    }
  },
});

afterEach(() => {
  server.resetHandlers();
  githubStore.reset();
});

afterAll(() => {
  server.close();
});
