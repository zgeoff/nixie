import { expect, test } from 'bun:test';
import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import type { LogRecord } from '@heynixie/log';
import { waitForCondition } from '@heynixie/testing';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { runHostCommand } from './test-utils/run-host-command';
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

  // boot data: every procedure but enrol needs a device session, and no test reads the device
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

  return { ...nixie, url, client, signedOut };
}

test('it keeps no message text in nixie.db, the key store or the logs', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Quince-reply-4ZT9' });
  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Plum-message-7QK2',
    thread: 'conversation',
  });
  await waitForCondition(async () => {
    const page = await ctx.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Quince-reply-4ZT9');
  });
  ctx.sendSignal('SIGTERM');
  await ctx.waitForExit();

  const files = await ctx.readDataFiles();

  expect(files.map((file) => file.name)).toIncludeAllMembers(['nixie.db', 'keys.db']);
  expect(
    files.filter((file) => /Plum-message-7QK2|Quince-reply-4ZT9/u.test(file.text)),
  ).toStrictEqual([]);
  expect(ctx.readOutput()).not.toMatch(/Plum-message-7QK2|Quince-reply-4ZT9/u);
}, 60_000);

test('it puts the snapshot hash of the definitions in force on every record', async () => {
  const ctx = await setupTest();
  const seeded = await ctx.waitForLogEvent('definitions.seeded');

  ctx.model.addReplies({ text: 'Quince-reply-4ZT9' });
  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Plum-message-7QK2',
    thread: 'conversation',
  });
  await waitForCondition(() =>
    ctx.model.requests.some((request) => request.path === '/v1/messages'),
  );
  ctx.sendSignal('SIGTERM');
  const run = await ctx.waitForExit();

  expect(run.records).toIncludeAllPartialMembers([
    {
      kind: 'owner_message',
      erasable: {
        status: 'readable',
        fields: { text: 'Plum-message-7QK2', spans: [{ start: 0, end: 17, source: 'unknown' }] },
      },
    },
    {
      kind: 'model.reply',
      erasable: { status: 'readable', fields: { text: 'Quince-reply-4ZT9' } },
    },
  ]);
  expect(seeded['snapshotHash']).toMatch(/^[0-9a-f]{64}$/u);
  expect(run.records).toSatisfyAll(
    (record: LogRecord) => record.definitions.snapshotHash === seeded['snapshotHash'],
  );
}, 60_000);

test('it lists the memory tools and web fetch to the conversation model', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Hello.' });
  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hi.',
    thread: 'conversation',
  });
  await waitForCondition(() =>
    ctx.model.requests.some((request) => request.path === '/v1/messages'),
  );

  expect(ctx.model.requests.find((request) => request.path === '/v1/messages')?.body).toMatchObject(
    {
      tools: expect.toIncludeAllPartialMembers([
        { name: 'mcp__nixie__memory_remember' },
        { name: 'mcp__nixie__memory_recall' },
        { name: 'mcp__nixie__memory_retire' },
        { name: 'mcp__nixie__web_fetch' },
      ]),
    },
  );
}, 60_000);

test('it applies a remembered fact that the owner typed, with their words as its evidence', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: { text: 'Sister Ada lives in Leeds', quote: 'my sister Ada lives in Leeds' },
      },
    },
    { toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } } },
    { text: 'Noted.' },
  );
  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [{ start: 0, end: 43, source: 'typed' }],
    text: 'Remember that my sister Ada lives in Leeds.',
    thread: 'conversation',
  });
  await waitForCondition(async () => {
    const page = await ctx.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Noted.');
  });
  ctx.sendSignal('SIGTERM');
  const run = await ctx.waitForExit();
  const message = run.records.find((record) => record.kind === 'owner_message');

  invariant(message, 'the run recorded no owner message');

  // the evidence is the quote's span in the typed message: characters 14 to 42
  expect(run.records.filter((record) => record.kind === 'memory.version_added')).toMatchObject([
    {
      contentSource: 'owner',
      payload: {
        change: 'created',
        origin: 'conversation',
        source: 'owner',
        state: 'active',
        evidence: { recordSequence: message.sequence, start: 14, end: 42 },
      },
    },
  ]);
  expect(run.records.filter((record) => record.kind === 'memory.proposed')).toStrictEqual([]);
}, 60_000);

test('it starts the memory writer with the batch gate, its catch-up from the first record', async () => {
  const ctx = await setupTest();

  const started = await ctx.waitForLogEvent('memory_writer.started');

  expect(started).toMatchObject({ cursor: 0, startSequence: expect.toBeNumber() });
  expect(ctx.readOutput()).not.toInclude('memory_writer.off');
}, 60_000);

test('it answers liveness per part', async () => {
  const ctx = await setupTest();

  const live = await fetch(`${ctx.url}/health/live`);
  const liveReport: unknown = await live.json();

  expect(live.status).toBe(200);
  expect(liveReport).toStrictEqual({
    status: 'ready',
    parts: { process: { isReady: true, reason: null }, database: { isReady: true, reason: null } },
  });
}, 60_000);

test('it answers readiness per part, with the slice 1 parts only', async () => {
  const ctx = await setupTest();

  const ready = await fetch(`${ctx.url}/health/ready`);
  const readyReport: unknown = await ready.json();

  expect(ready.status).toBe(200);
  expect(readyReport).toStrictEqual({
    status: 'ready',
    parts: {
      database: { isReady: true, reason: null },
      definitions: { isReady: true, reason: null },
      imp_host: { isReady: true, reason: null },
      conversation_imp: { isReady: true, reason: null },
      disk: { isReady: true, reason: null },
    },
  });
}, 60_000);

test('it stops claiming steps on SIGTERM, lets the turn in flight commit and exits 0', async () => {
  const ctx = await setupTest();
  const gate = Promise.withResolvers<void>();

  ctx.model.addReplies({ text: 'Held-reply', gate: gate.promise });
  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hello.',
    thread: 'conversation',
  });
  await waitForCondition(() =>
    ctx.model.requests.some((request) => request.path === '/v1/messages'),
  );
  await ctx.sendStopSignal();
  gate.resolve();
  const run = await ctx.waitForExit();

  expect(run.exitCode).toBe(0);
  expect(run.records).toIncludeAllPartialMembers([
    { kind: 'model.reply', erasable: { status: 'readable', fields: { text: 'Held-reply' } } },
  ]);
}, 60_000);

test('it issues a code from the running server through the enrol-code command', async () => {
  const ctx = await setupTest();
  const command = await runHostCommand(ctx.configPath, ['enrol-code']);
  const session = await ctx.signedOut.sessions.enrol({
    clientActionID: crypto.randomUUID(),
    code: command.stdout.split('\n')[0] ?? '',
    deviceName: 'phone',
    tokenDelivery: 'bearer',
  });

  expect(command.exitCode).toBe(0);
  expect(session.token).toBeString();
}, 60_000);

test('it lists a pending memory proposal and approves it through the memory commands', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__memory_remember', input: { text: 'Likes jazz' } } },
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
  const [proposal] = z
    .tuple([
      z.object({
        proposalID: z.string(),
        itemID: z.string(),
        actionHash: z.string(),
        text: z.string(),
      }),
    ])
    .parse(JSON.parse(listed.stdout));

  const approved = await runHostCommand(ctx.configPath, [
    'memory-approve',
    proposal.proposalID,
    '--hash',
    proposal.actionHash,
  ]);

  expect(proposal.text).toBe('Likes jazz');
  expect(JSON.parse(approved.stdout)).toStrictEqual({ itemID: proposal.itemID, version: 1 });
}, 60_000);

test('it refuses to start on a key no module reads, and exits 1', async () => {
  const nixie = await startTestNixie({ extraConfig: ['tasks:', '  runner: 5'] });

  const exitCode = await nixie.exited;
  const failure = await nixie.waitForLogEvent('command.failed');

  expect(exitCode).toBe(1);
  expect(failure).toMatchObject({
    command: 'serve',
    message: expect.toInclude('tasks: Unrecognized key: "runner"'),
  });
}, 60_000);
