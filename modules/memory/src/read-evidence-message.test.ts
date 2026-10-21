import { expect, test } from 'bun:test';
import { readEvidenceMessage } from './read-evidence-message';
import { removeMessageKey } from './test-utils/remove-message-key';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it reads the text of the message at the sequence', async () => {
  const ctx = await setupTest();

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'My sister Ana lives in Porto.',
    spans: [{ start: 0, end: 29, source: 'typed' }],
  });

  const message = await readEvidenceMessage(ctx.memory.log, sequence);

  expect(message).toStrictEqual({ status: 'readable', text: 'My sister Ana lives in Porto.' });
});

test('it reads a forgotten message as shredded', async () => {
  const ctx = await setupTest();

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'My sister Ana lives in Porto.',
    spans: [{ start: 0, end: 29, source: 'typed' }],
  });

  await removeMessageKey(ctx.memory.log, sequence);

  const message = await readEvidenceMessage(ctx.memory.log, sequence);

  expect(message).toStrictEqual({ status: 'shredded' });
});

test('it reads a sequence that holds no record as missing', async () => {
  const ctx = await setupTest();
  const message = await readEvidenceMessage(ctx.memory.log, 77);

  expect(message).toStrictEqual({ status: 'missing' });
});

test('it reads a record with no text as missing', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const message = await readEvidenceMessage(ctx.memory.log, 1);

  expect(message).toStrictEqual({ status: 'missing' });
});
