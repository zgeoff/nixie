import { expect, test } from 'bun:test';
import { startTestPhone } from '../test-utils';
import { readStoredMessageIDs } from './read-stored-message-ids';
import { writeReceivedText } from './write-received-text';

async function setupTest() {
  const phone = await startTestPhone();

  return {
    ...phone,
    writeText: (messageID: string) =>
      writeReceivedText(phone.context, {
        messageID,
        from: 'Example',
        body: 'Your code is 5521',
        receivedAt: phone.clock.now(),
        precisionMs: 1,
      }),
  };
}

test('#readStoredMessageIDs returns the given message IDs that nixie stored', async () => {
  const ctx = await setupTest();

  await ctx.writeText('SMs000001');
  await ctx.writeText('SMs000002');

  const stored = await readStoredMessageIDs(ctx.tasks.log, ['SMs000001', 'SMs000003']);

  expect(stored).toStrictEqual(new Set(['SMs000001']));
});

test('#readStoredMessageIDs returns none for no message IDs', async () => {
  const ctx = await setupTest();

  await ctx.writeText('SMs000001');

  const stored = await readStoredMessageIDs(ctx.tasks.log, []);

  expect(stored).toStrictEqual(new Set());
});
