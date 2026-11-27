import { expect, test } from 'bun:test';
import { createTestClient, sendClientMessage, startE2ENixie } from '@heynixie/server/test-utils';

async function setupTest() {
  // a config with no voice section, so calls are off
  const nixie = await startE2ENixie({});

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  return { nixie, api };
}

test('it offers the model no call tool when the config has no voice section', async () => {
  const ctx = await setupTest();

  ctx.nixie.model.addReplies({ text: 'Plum-reply-4VC3' });

  await sendClientMessage(ctx.api.client, { text: 'Quince-message-9WD6' }, 'Plum-reply-4VC3', {
    timeoutMs: 30_000,
  });

  const request = ctx.nixie.model.requests.find((entry) => entry.path === '/v1/messages');
  const tools = request?.body?.tools?.map((tool) => tool.name) ?? [];

  expect({
    hasConversationTool: tools.includes('mcp__nixie__task_start'),
    offered: tools.filter((name) => /call_|hand_off|hangup/u.test(name)),
  }).toStrictEqual({ hasConversationTool: true, offered: [] });
});

test('it leaves voice out of the features that nixie.read reports', async () => {
  const ctx = await setupTest();
  const read = await ctx.api.client.nixie.read();

  expect(read.features).not.toContain('voice');
});

test('it answers a procedure of the calls with FEATURE_OFF', async () => {
  const ctx = await setupTest();

  const started = ctx.api.client.calls.start({ clientActionID: crypto.randomUUID() });

  expect(started).rejects.toMatchObject({ code: 'FEATURE_OFF', data: { feature: 'voice' } });
});

test('it starts no part of the calls, so no call record is ever written', async () => {
  const ctx = await setupTest();

  ctx.nixie.model.addReplies({ text: 'Plum-reply-7QF1' });

  await sendClientMessage(ctx.api.client, { text: 'Quince-message-2PE8' }, 'Plum-reply-7QF1', {
    timeoutMs: 30_000,
  });

  const records = await ctx.nixie.readRecords();

  expect(records.filter((record) => record.kind.startsWith('call.'))).toStrictEqual([]);
});
