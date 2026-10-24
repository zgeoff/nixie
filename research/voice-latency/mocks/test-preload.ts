import { afterAll, afterEach, beforeAll } from 'bun:test';
import { decisionStore } from './decision-store.ts';
import { server } from './node.ts';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  decisionStore.reset();
});

afterAll(() => {
  server.close();
});
