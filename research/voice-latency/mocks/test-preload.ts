import { afterAll, afterEach, beforeAll } from 'bun:test';
import { datasetStore } from './dataset-store.ts';
import { decisionStore } from './decision-store.ts';
import { server } from './node.ts';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  decisionStore.reset();
  datasetStore.reset();
});

afterAll(() => {
  server.close();
});
