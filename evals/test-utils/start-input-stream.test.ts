import { expect, test } from 'bun:test';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { startInputStream } from './start-input-stream';

test('it yields each sent message in order, with its extra fields, until stopped', async () => {
  const input = startInputStream();

  input.send('first note');
  input.send('second note', { priority: 'next', uuid: '6c1f0d52-3a9e-4b7e-9d1a-2f4c5b6a7e8d' });
  input.stop();

  const read: SDKUserMessage[] = [];

  for await (const message of input.messages) {
    read.push(message);
  }

  expect(read).toStrictEqual([
    {
      type: 'user',
      message: { role: 'user', content: 'first note' },
      parent_tool_use_id: null,
    },
    {
      type: 'user',
      message: { role: 'user', content: 'second note' },
      parent_tool_use_id: null,
      priority: 'next',
      uuid: '6c1f0d52-3a9e-4b7e-9d1a-2f4c5b6a7e8d',
    },
  ]);
});

test('it waits for a message sent after the reader started', async () => {
  const input = startInputStream();
  const iterator = input.messages[Symbol.asyncIterator]();
  const pending = iterator.next();

  input.send('late note');

  const next = await pending;

  expect(next.value).toMatchObject({ message: { content: 'late note' } });
});

test('it ends a reader that waits when stopped', async () => {
  const input = startInputStream();
  const iterator = input.messages[Symbol.asyncIterator]();
  const pending = iterator.next();

  input.stop();

  const next = await pending;

  expect(next.done).toBeTrue();
});
