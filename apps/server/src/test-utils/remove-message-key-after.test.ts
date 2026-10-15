import { expect, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { startScriptedModel } from '@heynixie/testing';
import { removeMessageKeyAfter } from './remove-message-key-after';
import { startTestServer } from './start-test-server';
import { writeOwnerMessages } from './write-owner-messages';

// a test server and a scripted model whose requests the removal waits on
async function setupTest() {
  const server = await startTestServer();

  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  return { log: server.context.log, model };
}

test('it removes the message key once the model has the given number of requests', async () => {
  const ctx = await setupTest();
  const [sequence] = await writeOwnerMessages(ctx.log, ['My sister is called Robin.']);

  ctx.model.addReplies({ text: 'Hello.' });

  await Promise.all([
    removeMessageKeyAfter({ log: ctx.log, model: ctx.model }, { sequence, requests: 1 }),
    fetch(`${ctx.model.url}/v1/messages`, {
      method: 'POST',
      body: JSON.stringify({ model: 'claude-test-1', messages: [] }),
    }),
  ]);

  const entries = await readRecords(ctx.log, { afterSequence: 0, thread: 'conversation' });

  expect(entries.map((entry) => entry.record.erasable)).toStrictEqual([{ status: 'shredded' }]);
});

test('it throws on a record that has no key', async () => {
  const ctx = await setupTest();

  const removal = removeMessageKeyAfter(
    { log: ctx.log, model: ctx.model },
    { sequence: 99, requests: 0 },
  );

  await removal.catch(() => {});

  expect(removal).rejects.toThrow('the record 99 has no key');
});
