import { expect, test } from 'bun:test';
import { readMockWriterStatus } from './read-mock-writer-status';
import { store } from './store';

test('it reads the writer as on and caught up at the last record when the store holds no status', async () => {
  await Promise.all([
    store.records.create({ kind: 'owner_message', message: { text: 'Is the kettle on?' } }),
    store.records.create({ kind: 'owner_message', message: { text: 'Back at six.' } }),
  ]);

  expect(readMockWriterStatus()).toStrictEqual({
    isEnabled: true,
    backlog: 0,
    batches: 0,
    cursor: 2,
    failures: 0,
    isCatchingUp: false,
    lastError: null,
    retryAt: null,
  });
});

test('it reads the status the store holds', async () => {
  await store.memoryWriter.create({
    backlog: 12,
    batches: 3,
    cursor: 140,
    failures: 1,
    isCatchingUp: true,
    isEnabled: false,
    lastError: { at: new Date('2026-03-02T09:15:00Z'), code: 'model_timeout', message: null },
    retryAt: new Date('2026-03-02T09:20:00Z'),
  });

  expect(readMockWriterStatus()).toStrictEqual({
    isEnabled: false,
    backlog: 12,
    batches: 3,
    cursor: 140,
    failures: 1,
    isCatchingUp: true,
    lastError: { at: new Date('2026-03-02T09:15:00Z'), code: 'model_timeout', message: null },
    retryAt: new Date('2026-03-02T09:20:00Z'),
  });
});
