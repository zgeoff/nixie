import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { z } from 'zod';
import { createApprovedItems } from './test-utils/create-approved-items';
import { createTestClient } from './test-utils/create-test-client';
import { readItemTraces } from './test-utils/read-item-traces';
import { runHostCommand } from './test-utils/run-host-command';
import { runHostCommands } from './test-utils/run-host-commands';
import { sendClientMessage } from './test-utils/send-client-message';
import { startTestNixie } from './test-utils/start-test-nixie';

async function setupTest() {
  const nixie = await startTestNixie();
  const clients = await createTestClient(nixie);

  return { ...nixie, ...clients };
}

test('it approves a proposal with your text, then edits, retires, restores and pins the item through the memory commands', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__memory_remember', input: { text: 'Likes jaz' } } },
    { text: 'Noted.' },
  );

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'I like jazz.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await ctx.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Noted.');
  });

  const listed = await runHostCommand(ctx.configPath, ['memory-pending']);

  const [{ proposalID, itemID, actionHash }] = z
    .tuple([z.object({ proposalID: z.string(), itemID: z.string(), actionHash: z.string() })])
    .parse(JSON.parse(listed.stdout));

  const runs = await runHostCommands(ctx.configPath, [
    ['memory-approve', proposalID, '--hash', actionHash, '--text', 'Likes jazz'],
    ['memory-edit', `${itemID}@1`, '--text', 'Likes jazz and blues'],
    ['memory-retire', `${itemID}@2`],
    ['memory-restore', `${itemID}@3`],
    ['memory-pin', itemID],
    ['memory-unpin', itemID],
    ['memory-show', itemID],
  ]);

  expect(runs.map((run): unknown => JSON.parse(run.stdout))).toMatchObject([
    { status: 'applied', itemID, version: 1 },
    { itemID, version: 2 },
    { itemID, version: 3 },
    { itemID, version: 4 },
    { itemID, isPinned: true },
    { itemID, isPinned: false },
    {
      itemID,
      versions: [
        { version: 1, change: 'created', origin: 'owner', text: 'Likes jazz' },
        { version: 2, change: 'edited', origin: 'owner', text: 'Likes jazz and blues' },
        { version: 3, change: 'retired', state: 'retired', origin: 'owner' },
        { version: 4, change: 'restored', state: 'active', origin: 'owner' },
      ],
    },
  ]);
}, 60_000);

test('it rejects a proposal with your reason, which the next turn reads in its events block', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__memory_remember', input: { text: 'Plays the oboe' } } },
    { text: 'Noted.' },
    { text: 'Understood.' },
  );

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'I tried the oboe once.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await ctx.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Noted.');
  });

  const listed = await runHostCommand(ctx.configPath, ['memory-pending']);

  const [{ proposalID, actionHash }] = z
    .tuple([z.object({ proposalID: z.string(), actionHash: z.string() })])
    .parse(JSON.parse(listed.stdout));

  await runHostCommand(ctx.configPath, [
    'memory-reject',
    proposalID,
    '--hash',
    actionHash,
    '--reason',
    'only tried it once',
  ]);

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Anyway, how are you?',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await ctx.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Understood.');
  });

  expect(JSON.stringify(ctx.model.requests.map((request) => request.body?.messages))).toInclude(
    String.raw`Reason: \"only tried it once\".`,
  );
}, 60_000);

test('it forgets an item through the memory view, which leaves no key, match or session copy of it', async () => {
  const ctx = await setupTest();

  // BM25 ranks nothing in an index of 1 or 2 items, so per-turn retrieval needs 3 to place one
  const [key] = await createApprovedItems(ctx, ctx.client, [
    'The spare key sits under the blue flowerpot',
    'Allergic to hazelnuts',
    'Prefers window seats on trains',
  ]);

  ctx.model.addReplies({ text: 'Under the flowerpot.' });

  await sendClientMessage(ctx.client, { text: 'Where is the spare key?' }, 'Under the flowerpot.');

  const before = await readItemTraces(ctx, ctx.client, key);
  const preview = await ctx.client.memory.previewForget({ itemID: key.itemID, version: 1 });

  await ctx.client.memory.forget({
    clientActionID: crypto.randomUUID(),
    itemID: key.itemID,
    version: preview.version,
  });

  const after = await readItemTraces(ctx, ctx.client, key);

  expect(before).toStrictEqual({
    hasKey: true,
    isMatched: true,
    sessionFiles: expect.toSatisfy((paths: readonly string[]) =>
      paths.some((path) => path.includes('/.claude/')),
    ),
  });

  expect(after).toStrictEqual({ hasKey: false, isMatched: false, sessionFiles: [] });
}, 60_000);

test('it runs the turn after a forget through the memory view on a rebuilt session without the item', async () => {
  const ctx = await setupTest();

  const [key] = await createApprovedItems(ctx, ctx.client, [
    'The spare key sits under the blue flowerpot',
    'Allergic to hazelnuts',
    'Prefers window seats on trains',
  ]);

  ctx.model.addReplies({ text: 'Under the flowerpot.' }, { text: 'You are welcome.' });

  await sendClientMessage(ctx.client, { text: 'Where is the spare key?' }, 'Under the flowerpot.');

  await ctx.client.memory.forget({ clientActionID: crypto.randomUUID(), ...key, version: 1 });

  await sendClientMessage(ctx.client, { text: 'Thanks.' }, 'You are welcome.');

  ctx.sendSignal('SIGTERM');

  const run = await ctx.waitForExit();

  expect(JSON.stringify(ctx.model.requests.at(-1)?.body)).toSatisfy(
    (request: string) => request.includes('Thanks.') && !request.includes('blue flowerpot'),
  );

  expect(
    run.records.filter((record) => /^memory\.forg|^model\.session_/u.test(record.kind)),
  ).toMatchObject([
    { kind: 'model.session_opened', payload: { kind: 'first' } },
    { kind: 'memory.forget_started', payload: { itemID: key.itemID, version: 1 } },
    { kind: 'model.session_invalidated' },
    { kind: 'model.session_cleanup_completed' },
    { kind: 'memory.forgotten', payload: { itemID: key.itemID } },
    { kind: 'model.session_opened', payload: { kind: 'rebuild', reason: 'forget' } },
  ]);
}, 60_000);

test('it forgets an item through memory-forget, which leaves no key, match or session copy of it', async () => {
  const ctx = await setupTest();

  const [lock] = await createApprovedItems(ctx, ctx.client, [
    'The bike lock code is 6082',
    'Allergic to hazelnuts',
    'Prefers window seats on trains',
  ]);

  ctx.model.addReplies({ text: 'It is 6082.' });

  await sendClientMessage(ctx.client, { text: 'What is the bike lock code?' }, 'It is 6082.');

  const before = await readItemTraces(ctx, ctx.client, lock);
  const forgotten = await runHostCommand(ctx.configPath, ['memory-forget', `${lock.itemID}@1`]);
  const after = await readItemTraces(ctx, ctx.client, lock);

  expect(JSON.parse(forgotten.stdout)).toStrictEqual({ itemID: lock.itemID });

  expect(before).toStrictEqual({
    hasKey: true,
    isMatched: true,
    sessionFiles: expect.toSatisfy((paths: readonly string[]) =>
      paths.some((path) => path.includes('/.claude/')),
    ),
  });

  expect(after).toStrictEqual({ hasKey: false, isMatched: false, sessionFiles: [] });
}, 60_000);

test('it runs the turn after memory-forget on a rebuilt session without the item', async () => {
  const ctx = await setupTest();

  const [lock] = await createApprovedItems(ctx, ctx.client, [
    'The bike lock code is 6082',
    'Allergic to hazelnuts',
    'Prefers window seats on trains',
  ]);

  ctx.model.addReplies({ text: 'It is 6082.' }, { text: 'You are welcome.' });

  await sendClientMessage(ctx.client, { text: 'What is the bike lock code?' }, 'It is 6082.');
  await runHostCommand(ctx.configPath, ['memory-forget', `${lock.itemID}@1`]);
  await sendClientMessage(ctx.client, { text: 'Thanks.' }, 'You are welcome.');

  ctx.sendSignal('SIGTERM');

  const run = await ctx.waitForExit();

  expect(JSON.stringify(ctx.model.requests.at(-1)?.body)).toSatisfy(
    (request: string) => request.includes('Thanks.') && !request.includes('bike lock code is 6082'),
  );

  expect(
    run.records.filter((record) => /^memory\.forg|^model\.session_/u.test(record.kind)),
  ).toMatchObject([
    { kind: 'model.session_opened', payload: { kind: 'first' } },
    { kind: 'memory.forget_started', payload: { itemID: lock.itemID, version: 1 } },
    { kind: 'model.session_invalidated' },
    { kind: 'model.session_cleanup_completed' },
    { kind: 'memory.forgotten', payload: { itemID: lock.itemID } },
    { kind: 'model.session_opened', payload: { kind: 'rebuild', reason: 'forget' } },
  ]);
}, 60_000);

test('it refuses a reason on an approval before it reads the configuration', async () => {
  const run = await runHostCommand('/nonexistent/config.yaml', [
    'memory-approve',
    'proposal-1',
    '--hash',
    'sha256:hash',
    '--reason',
    'looks right',
  ]);

  expect(run.exitCode).toBe(2);
});

test('it refuses a version target that is not a plain decimal before it reads the configuration', async () => {
  const runs = await runHostCommands('/nonexistent/config.yaml', [
    ['memory-retire', 'item-1@0x2'],
    ['memory-restore', 'item-1@ 2'],
    ['memory-edit', 'item-1@', '--text', 'Likes jazz'],
    ['memory-forget', 'item-1'],
  ]);

  expect(runs.map((run) => run.exitCode)).toStrictEqual([2, 2, 2, 2]);
});
