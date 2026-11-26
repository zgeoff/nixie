import { expect, test } from 'bun:test';
import { seedCodeRunFiles } from '@heynixie/connectors/test-utils';
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

test('it lists each file of a mail send by name and size on the card', async () => {
  const memory = await startTestMemory();

  const seeded = await seedCodeRunFiles(memory.log, {
    thread: 'conversation',
    writes: { 'out/plan.txt': 'The plan.' },
  });

  const fields = await readActionBodyFields(
    memory.log,
    {
      tool: 'mail.send',
      thread: 'conversation',
      input: {
        to: ['hello@library.example.org'],
        subject: 'Plan',
        text: 'See the plan.',
        files: seeded.files.map((file) => file.file),
        replyWake: '2d',
      },
      callSequence: 1,
    },
    { replyExpiryMs: 604_800_000 },
  );

  expect(fields).toStrictEqual({
    status: 'fields',
    fields: { replyWake: '2d', files: 'plan.txt (9 B)' },
  });
});

test('it words the card of a Gmail label change with its thread count and each label', async () => {
  const memory = await startTestMemory();

  const fields = await readActionBodyFields(
    memory.log,
    {
      tool: 'gmail.label',
      thread: 'conversation',
      input: { threads: ['k3x9m2p7qa.a1', 'k3x9m2p7qa.b2'], add: ['Reports'], remove: ['INBOX'] },
      callSequence: 1,
    },
    undefined,
  );

  expect(fields).toStrictEqual({
    status: 'fields',
    fields: {},
    sentence: 'Label 2 threads: add Reports, remove INBOX',
    approveLabel: 'Label',
  });
});

test('it leaves the card of a Gmail send without a body when its facts are gone', async () => {
  const memory = await startTestMemory();

  const fields = await readActionBodyFields(
    memory.log,
    { tool: 'gmail.send', thread: 'conversation', input: {}, callSequence: 1 },
    undefined,
  );

  expect(fields).toStrictEqual({ status: 'unreadable' });
});
