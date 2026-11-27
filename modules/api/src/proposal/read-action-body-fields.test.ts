import { expect, onTestFinished, test } from 'bun:test';
import { seedCodeRunFiles } from '@heynixie/connectors/test-utils';
import { startTestMemory } from '@heynixie/memory/test-utils';
import { bodyFieldReaders } from '../utils/body-field-readers';
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
    'UTC',
  );

  expect(fields).toStrictEqual({ status: 'fields', fields: { replyWake: '7d, the default' } });
});

test('it adds no field to a mail send in a deployment with no mailbox', async () => {
  const memory = await startTestMemory();

  const fields = await readActionBodyFields(
    memory.log,
    { tool: 'mail.send', thread: 'conversation', input: {}, callSequence: 1 },
    undefined,
    'UTC',
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
    'UTC',
  );

  expect(fields).toStrictEqual({
    status: 'fields',
    fields: { replyWake: '2d', files: 'plan.txt (9 B)' },
  });
});

test('it asks each reader on the list in turn and answers the first card that one gives', async () => {
  const memory = await startTestMemory();

  bodyFieldReaders.set([
    (_log, request) => {
      if (request.tool === 'first.tool') {
        return Promise.resolve({ status: 'fields', fields: { from: 'first' } });
      }

      return Promise.resolve({ status: 'none' });
    },
    (_log, request) => {
      if (request.tool === 'second.tool') {
        return Promise.resolve({ status: 'fields', fields: { from: 'second' } });
      }

      return Promise.resolve({ status: 'none' });
    },
  ]);

  onTestFinished(() => {
    bodyFieldReaders.set([]);
  });

  const fields = await readActionBodyFields(
    memory.log,
    { tool: 'second.tool', thread: 'conversation', input: {}, callSequence: 1 },
    undefined,
    'UTC',
  );

  expect(fields).toStrictEqual({ status: 'fields', fields: { from: 'second' } });
});

test('it asks every reader on the list about a tool and adds no field when none owns it', async () => {
  const memory = await startTestMemory();

  const asked: string[] = [];

  bodyFieldReaders.set([
    (_log, request) => {
      asked.push(`first:${request.tool}`);

      return Promise.resolve({ status: 'none' });
    },
    (_log, request) => {
      asked.push(`second:${request.tool}`);

      return Promise.resolve({ status: 'none' });
    },
  ]);

  onTestFinished(() => {
    bodyFieldReaders.set([]);
  });

  const fields = await readActionBodyFields(
    memory.log,
    { tool: 'other.tool', thread: 'conversation', input: {}, callSequence: 1 },
    undefined,
    'UTC',
  );

  expect([fields, asked]).toStrictEqual([
    { status: 'none' },
    ['first:other.tool', 'second:other.tool'],
  ]);
});
