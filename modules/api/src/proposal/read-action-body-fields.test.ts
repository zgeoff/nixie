import { expect, test } from 'bun:test';
import { startTestMemory } from '@heynixie/memory/test-utils';
import { readActionBodyFields } from './read-action-body-fields';

test('it shows the reply rule that a send with no reply wake sets, from the deployment default', async () => {
  const memory = await startTestMemory();

  const fields = await readActionBodyFields(
    memory.log,
    {
      tool: 'mail.send',
      thread: 'conversation',
      input: { to: ['hello@library.example.org'], subject: 'A question', text: 'Hello.' },
      callSequence: 1,
    },
    { replyExpiryMs: 604_800_000 },
  );

  expect(fields).toStrictEqual({ status: 'fields', fields: { replyWake: '7d, the default' } });
});

test('it adds no field to a mail send in a deployment with no mailbox', async () => {
  const memory = await startTestMemory();

  const fields = await readActionBodyFields(
    memory.log,
    { tool: 'mail.send', thread: 'conversation', input: {}, callSequence: 1 },
    undefined,
  );

  expect(fields).toStrictEqual({ status: 'none' });
});
