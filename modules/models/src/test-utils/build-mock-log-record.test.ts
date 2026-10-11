import { expect, test } from 'bun:test';
import { buildMockLogRecord } from './build-mock-log-record';

test('it builds a default log record', () => {
  expect(buildMockLogRecord()).toStrictEqual({
    sequence: 7,
    recordedAt: new Date(0),
    kind: 'owner_message',
    definitions: { snapshotHash: 'sha256:test' },
    thread: 'conversation',
    stepKey: null,
    parent: null,
    contentSource: 'owner',
    decision: null,
    promptCause: null,
    approval: null,
    payload: {},
    erasable: { status: 'readable', fields: { text: 'Buy milk.' } },
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockLogRecord({ kind: 'timer.fired', erasable: { status: 'none' } })).toMatchObject({
    sequence: 7,
    kind: 'timer.fired',
    erasable: { status: 'none' },
  });
});
