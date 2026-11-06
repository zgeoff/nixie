import { expect, test } from 'bun:test';
import { hasTaskMessage } from './has-task-message';
import { buildMockLogRecord } from './test-utils/build-mock-log-record';

test('it finds a message that the thread received', () => {
  const records = [
    buildMockLogRecord({
      kind: 'task_message',
      taskMessage: {
        from: 'k3vq8m2xpa',
        fromName: 'Garden plan',
        hop: 1,
        kind: 'report',
        messageID: 'm7q2x9k4pa',
        to: 'conversation',
        woke: true,
      },
    }),
  ];

  expect(hasTaskMessage(records, 'm7q2x9k4pa')).toBeTrue();
});

test('it finds a message that the thread sent, with its call and result in different records', () => {
  const records = [
    buildMockLogRecord({
      kind: 'tool_called',
      sequence: 1,
      toolCall: {
        callID: 'call-1',
        input: { body: 'Plan the bean bed.', kind: 'request', to: 'k3vq8m2xpa' },
        tool: 'task.message',
      },
    }),
    buildMockLogRecord({
      kind: 'tool_result',
      sequence: 2,
      toolCall: {
        callID: 'call-1',
        content: { result: { hop: 1, messageID: 'r4t8w2qz6n', woke: true } },
        outcome: 'result',
      },
    }),
  ];

  expect(hasTaskMessage(records, 'r4t8w2qz6n')).toBeTrue();
});

test('it finds no message that the thread neither sent nor received', () => {
  const records = [buildMockLogRecord({ kind: 'owner_message', message: { text: 'Hello' } })];

  expect(hasTaskMessage(records, 'm7q2x9k4pa')).toBeFalse();
});
