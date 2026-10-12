import { expect, test } from 'bun:test';
import { buildMockLogRecord } from './build-mock-log-record';

test('it builds a default log record', () => {
  expect(buildMockLogRecord()).toStrictEqual({
    sequence: expect.toBeWithin(1, 1_000_001),
    recordedAt: expect.toBeValidDate(),
    kind: 'owner_message',
    definitions: {
      snapshotHash: expect.toSatisfy((hash: string) => /^sha256:[\da-f]{64}$/u.test(hash)),
    },
    thread: null,
    stepKey: null,
    parent: null,
    contentSource: null,
    decision: null,
    promptCause: null,
    approval: null,
    payload: {},
    erasable: { status: 'none' },
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockLogRecord({
      sequence: 7,
      kind: 'model.reply',
      thread: 'conversation',
      payload: { model: 'claude-test-1' },
      erasable: { status: 'readable', fields: { text: 'Hello.' } },
    }),
  ).toStrictEqual({
    sequence: 7,
    recordedAt: expect.toBeValidDate(),
    kind: 'model.reply',
    definitions: {
      snapshotHash: expect.toSatisfy((hash: string) => /^sha256:[\da-f]{64}$/u.test(hash)),
    },
    thread: 'conversation',
    stepKey: null,
    parent: null,
    contentSource: null,
    decision: null,
    promptCause: null,
    approval: null,
    payload: { model: 'claude-test-1' },
    erasable: { status: 'readable', fields: { text: 'Hello.' } },
  });
});

test('it merges a definitions override into the default snapshot hash', () => {
  expect(buildMockLogRecord({ definitions: { personaVersion: 'p3' } }).definitions).toStrictEqual({
    snapshotHash: expect.toSatisfy((hash: string) => /^sha256:[\da-f]{64}$/u.test(hash)),
    personaVersion: 'p3',
  });
});
