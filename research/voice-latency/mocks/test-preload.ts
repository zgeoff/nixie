import { afterAll, afterEach, beforeAll } from 'bun:test';
import { datasetStore } from './dataset-store.ts';
import { decisionStore } from './decision-store.ts';
import { server } from './node.ts';

beforeAll(() => {
  // A test that starts its own local server, such as a stub voice vendor, reaches it directly.
  server.listen({
    onUnhandledRequest: (request, print) => {
      const { hostname } = new URL(request.url);
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        print.error();
      }
    },
  });
});

afterEach(() => {
  server.resetHandlers();
  decisionStore.reset();
  datasetStore.reset();
});

afterAll(() => {
  server.close();
});
