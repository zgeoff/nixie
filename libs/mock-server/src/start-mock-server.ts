import { afterAll, afterEach, beforeAll } from 'bun:test';
import { mockServer } from './mock-server';

// Bun runs a preload's beforeAll and afterAll once for each file under `--parallel --no-isolate`,
// and once for the whole run otherwise, so the server starts in the one and stops in the other.
beforeAll(() => {
  mockServer.listen({
    // The web server suites call a stub API and the built Start server on loopback ports, which MSW
    // must pass through. No DNS answers the reserved .test domain, so a test site there never
    // reaches the network.
    onUnhandledRequest: (request, print) => {
      const hostname = new URL(request.url).hostname;

      if (['127.0.0.1', '[::1]', 'localhost'].includes(hostname) || hostname.endsWith('.test')) {
        return;
      }

      print.error();
    },
  });
});

afterEach(() => {
  mockServer.resetHandlers();
});

afterAll(() => {
  mockServer.close();
});
