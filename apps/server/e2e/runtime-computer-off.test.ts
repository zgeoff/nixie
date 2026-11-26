import { expect, test } from 'bun:test';
import { createTestClient, sendClientMessage, startE2ENixie } from '@heynixie/server/test-utils';

async function setupTest() {
  // the manifest of this nixie holds neither the computer image nor the code image, so a start that
  // still needs one refuses
  const nixie = await startE2ENixie({ isComputerOff: true, isCodeOff: true });

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  return { nixie, api };
}

test('it starts with no computer and no code image, and offers the model no computer or code tool', async () => {
  const ctx = await setupTest();

  ctx.nixie.model.addReplies({ text: 'Plum-reply-2RT7' });

  await sendClientMessage(ctx.api.client, { text: 'Quince-message-3KD8' }, 'Plum-reply-2RT7', {
    timeoutMs: 30_000,
  });

  const request = ctx.nixie.model.requests.find((entry) => entry.path === '/v1/messages');
  const tools = request?.body?.tools?.map((tool) => tool.name) ?? [];

  expect({
    hasConversationTool: tools.includes('mcp__nixie__task_start'),
    offered: tools.filter((name) => /computer|code_run|file_send/u.test(name)),
  }).toStrictEqual({ hasConversationTool: true, offered: [] });
});

test('it reports neither the computer nor the code tool as a feature that is on', async () => {
  const ctx = await setupTest();
  const read = await ctx.api.client.nixie.read();

  expect(
    read.features.filter((feature) => feature === 'computer' || feature === 'code'),
  ).toStrictEqual([]);
});

test('it answers a procedure of the computer with FEATURE_OFF, and writes no take-over or handover record', async () => {
  const ctx = await setupTest();

  const handover = ctx.api.client.computer.readHandover();

  await expect(handover).rejects.toMatchObject({
    code: 'FEATURE_OFF',
    data: { feature: 'computer' },
  });

  const records = await ctx.nixie.readRecords();

  expect(records.filter((record) => record.kind.startsWith('computer.'))).toStrictEqual([]);
});
