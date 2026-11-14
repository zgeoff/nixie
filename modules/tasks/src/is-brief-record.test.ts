import { expect, test } from 'bun:test';
import { isBriefRecord } from './is-brief-record';

test.each([
  [0, true],
  [1, false],
  [3, false],
])('it reads a task message at hop %d as a brief: %p', (hop, isBrief) => {
  const payload = {
    messageID: 'm7k2',
    from: 'conversation',
    to: 't4m2',
    kind: 'request',
    replyTo: null,
    onBehalfOf: [],
    hop,
    hopLimit: 6,
    wake: true,
    woke: true,
    opensWait: false,
    source: 'task:conversation',
  };

  expect(isBriefRecord({ kind: 'task_message', payload })).toBe(isBrief);
});

test('it reads a record of another kind as no brief', () => {
  expect(isBriefRecord({ kind: 'owner_message', payload: {} })).toBeFalse();
});
