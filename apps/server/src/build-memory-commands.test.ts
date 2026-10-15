import { expect, test } from 'bun:test';
import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import { waitForCondition } from '@heynixie/testing';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { z } from 'zod';
import { runHostCommand } from './test-utils/run-host-command';
import { runHostCommands } from './test-utils/run-host-commands';
import { startTestNixie } from './test-utils/start-test-nixie';

// nixie in a test build at ready, with a device signed in through the code it printed at start
async function setupTest() {
  const nixie = await startTestNixie();
  const listening = await nixie.waitForLogEvent('http.listening');
  const issued = await nixie.waitForLogEvent('enrolment_code.issued');

  await nixie.waitForLogEvent('ready');

  const url = `http://127.0.0.1:${String(listening['port'])}`;

  const signedOut = createORPCClient<ContractClient>(
    new RPCLink({ url: `${url}/rpc`, headers: { [clientHeaderName]: 'test' } }),
  );

  // boot data: every procedure but enrol needs a device session
  const session = await signedOut.sessions.enrol({
    clientActionID: crypto.randomUUID(),
    code: String(issued['code']),
    deviceName: 'laptop',
    tokenDelivery: 'bearer',
  });

  const client = createORPCClient<ContractClient>(
    new RPCLink({
      url: `${url}/rpc`,
      headers: { [clientHeaderName]: 'test', authorization: `Bearer ${session.token ?? ''}` },
    }),
  );

  return { ...nixie, client };
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
  ]);

  expect(runs.map((run) => run.exitCode)).toStrictEqual([2, 2, 2]);
});
