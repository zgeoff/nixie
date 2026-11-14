import { expect, test } from 'bun:test';
import { collectSentMessages } from './collect-sent-messages';

test('it reads a sent message from a call of the message tool and its result', () => {
  expect(
    collectSentMessages([
      {
        callID: 'call-1',
        content: { result: { hop: 3, messageID: 'r4t8w2qz6n', woke: false } },
        input: { body: 'Order the runner beans.', kind: 'request', to: 'p7hd2wq9zn' },
        outcome: 'result',
        tool: 'task.message',
      },
    ]),
  ).toStrictEqual([
    {
      direction: 'sent',
      hop: 3,
      kind: 'request',
      messageID: 'r4t8w2qz6n',
      taskID: 'p7hd2wq9zn',
      text: 'Order the runner beans.',
      woke: false,
    },
  ]);
});

test.each([
  {
    case: 'a refused message',
    call: {
      callID: 'call-1',
      content: { message: 'a task cannot message itself' },
      input: { body: 'Order the runner beans.', kind: 'request', to: 'p7hd2wq9zn' },
      outcome: 'error',
      tool: 'task.message',
    },
  },
  {
    case: 'a message still waiting for its result',
    call: {
      callID: 'call-1',
      input: { body: 'Order the runner beans.', kind: 'request', to: 'p7hd2wq9zn' },
      tool: 'task.message',
    },
  },
  {
    case: 'a message whose input a forget erased',
    call: {
      callID: 'call-1',
      content: { result: { hop: 1, messageID: 'r4t8w2qz6n', woke: true } },
      outcome: 'result',
      tool: 'task.message',
    },
  },
  {
    case: 'a call of another tool',
    call: {
      callID: 'call-1',
      content: { result: { hop: 1, messageID: 'r4t8w2qz6n', woke: true } },
      input: { body: 'Order the runner beans.', kind: 'request', to: 'p7hd2wq9zn' },
      outcome: 'result',
      tool: 'notes.add',
    },
  },
])('it reads no sent message from $case', (row) => {
  expect(collectSentMessages([row.call])).toStrictEqual([]);
});
