import { expect, test } from 'bun:test';
import { makeErasureRunner } from '@heynixie/log';
import { buildTestErasureEffects } from '@heynixie/log/test-utils';
import { buildTextErasable } from '../erasure/build-text-erasable';
import { phoneTextErasableDescriptor } from '../erasure/phone-text-erasable-descriptor';
import { startTestPhone } from '../test-utils';
import { readStoredText } from './read-stored-text';
import { writeReceivedText } from './write-received-text';

async function setupTest() {
  const phone = await startTestPhone();

  const runner = makeErasureRunner({
    log: phone.tasks.log,
    definitions: phone.context.definitions,
    effects: buildTestErasureEffects().effects,
  });

  return {
    ...phone,
    forget: runner.register({ ...phoneTextErasableDescriptor, ...buildTextErasable() }),
    writeText: () =>
      writeReceivedText(phone.context, {
        messageID: 'SMr000001',
        from: 'Example',
        body: 'Your code is 5521',
        receivedAt: phone.clock.now(),
        precisionMs: 1,
      }),
  };
}

test('#readStoredText returns the sender and body of a stored text', async () => {
  const ctx = await setupTest();
  const shortID = await ctx.writeText();
  const fields = await readStoredText(ctx.tasks.log, shortID);

  expect(fields).toStrictEqual({ from: 'Example', body: 'Your code is 5521' });
});

test('#readStoredText returns null for an ID that names no text', async () => {
  const ctx = await setupTest();
  const fields = await readStoredText(ctx.tasks.log, 'txzzzzzzzz');

  expect(fields).toBeNull();
});

test('#readStoredText returns null once the forget of the text has begun', async () => {
  const ctx = await setupTest();
  const shortID = await ctx.writeText();

  await ctx.forget.begin({ text: shortID }, { by: 'user' });

  const fields = await readStoredText(ctx.tasks.log, shortID);

  expect(fields).toBeNull();
});

test('#readStoredText returns null once the forget of the text has finished', async () => {
  const ctx = await setupTest();
  const shortID = await ctx.writeText();
  const begun = await ctx.forget.begin({ text: shortID }, { by: 'user' });

  const targetID = begun.status === 'begun' ? begun.target.targetID : '';

  await ctx.forget.finish(targetID);

  const fields = await readStoredText(ctx.tasks.log, shortID);

  expect(fields).toBeNull();
});
