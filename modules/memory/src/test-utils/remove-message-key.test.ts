import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { removeMessageKey } from './remove-message-key';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it leaves the message erasable fields unreadable', async () => {
  const ctx = await setupTest();
  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'My locker code is 4417.' },
    },
  ]);

  invariant(message);
  await removeMessageKey(ctx.memory.log, message.sequence);

  const [entry] = await readRecords(ctx.memory.log, { afterSequence: message.sequence - 1 });

  expect(entry?.record.erasable.status).toBe('shredded');
});

test('it rejects a record with no key', async () => {
  const ctx = await setupTest();
  const [record] = await writeRecords(ctx.memory.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {},
    },
  ]);

  const removal = removeMessageKey(ctx.memory.log, record?.sequence ?? -1);

  await removal.catch(() => {});

  expect(removal).rejects.toThrow('has no key');
});
