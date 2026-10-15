import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildCheckedRememberReplies } from './test-utils/build-checked-remember-replies';
import { createTestClient } from './test-utils/create-test-client';
import { runHostCommand } from './test-utils/run-host-command';
import { runTestReset } from './test-utils/run-test-reset';
import { sendClientMessage } from './test-utils/send-client-message';
import { startTestNixie } from './test-utils/start-test-nixie';

// nixie in a test build at ready, with a device signed in through the code it printed at start
async function setupTest() {
  const nixie = await startTestNixie();

  // boot data: every procedure but enrol needs a device session, whose name each message carries
  const clients = await createTestClient(nixie);

  return { ...nixie, ...clients };
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
        fields: {
          text: 'Plum-message-7QK2',
          spans: [{ start: 0, end: 17, source: 'unknown' }],
          sessionLabel: 'laptop',
        },
      },
    },
    {
      kind: 'model.reply',
      erasable: { status: 'readable', fields: { text: 'Quince-reply-4ZT9' } },
    },
  ]);

  expect(seeded['inForceSnapshotHash']).toMatch(/^[0-9a-f]{64}$/u);

  expect(run.records).toSatisfyAll(
    (record: (typeof run.records)[number]) =>
      record.definitions.snapshotHash === seeded['inForceSnapshotHash'],
  );
}, 60_000);

test('it lists the memory tools, web fetch, the time tool and the log reader to the conversation model', async () => {
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
        { name: 'mcp__nixie__memory_pending' },
        { name: 'mcp__nixie__memory_retire' },
        { name: 'mcp__nixie__web_fetch' },
        { name: 'mcp__nixie__time_now' },
        { name: 'mcp__nixie__log_read' },
      ]),
    },
  );
}, 60_000);

test('it calls the owner by the name the secrets file holds, which the configuration names by reference', async () => {
  const nixie = await startTestNixie({
    extraConfig: ['owner:', '  name: deployment:owner_name'],
    extraSecrets: ['settings:', '  owner_name: Wren Halloway'],
  });

  const signedIn = await createTestClient(nixie);

  nixie.model.addReplies({ text: 'Hello.' });

  await signedIn.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hi.',
    thread: 'conversation',
  });

  await waitForCondition(() =>
    nixie.model.requests.some((request) => request.path === '/v1/messages'),
  );

  expect(
    nixie.model.requests.find((request) => request.path === '/v1/messages')?.body,
  ).toMatchObject({
    system: expect.toIncludeAllPartialMembers([
      { text: expect.toInclude("blocks in Wren Halloway's messages") },
    ]),
  });
}, 60_000);

test('it answers the time tool in the zone of the newest message', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { text: 'Safe travels.' },
    { toolUse: { name: 'mcp__nixie__time_now', input: {} } },
    { text: 'It is evening in London.' },
  );

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Flying out of Tokyo tonight.',
    thread: 'conversation',
    timeZone: 'Asia/Tokyo',
  });

  await waitForCondition(async () => {
    const page = await ctx.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Safe travels.');
  });

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Landed. What time is it here?',
    thread: 'conversation',
    timeZone: 'Europe/London',
  });

  await waitForCondition(async () => {
    const page = await ctx.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'It is evening in London.');
  });

  const page = await ctx.client.conversation.read({ thread: 'conversation' });

  expect(page.records.find((record) => record.kind === 'tool_result')?.toolCall).toMatchObject({
    outcome: 'result',
    content: { result: { timeZone: 'Europe/London', timeZoneFrom: 'message' } },
  });
}, 60_000);

test('it shows the model when each message was sent, in its own zone or the default one', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Hello.' }, { text: 'Welcome to Tokyo.' });

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hi.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await ctx.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Hello.');
  });

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Just landed.',
    thread: 'conversation',
    timeZone: 'Asia/Tokyo',
  });

  await waitForCondition(async () => {
    const page = await ctx.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Welcome to Tokyo.');
  });

  const sent = JSON.stringify(
    ctx.model.requests.findLast((request) => request.path === '/v1/messages')?.body?.messages,
  );

  expect(sent).toMatch(
    /\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, Sydney · laptop\] Hi\./u,
  );

  expect(sent).toMatch(
    /\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, Tokyo · laptop\] Just landed\./u,
  );
}, 60_000);

test('it shows the model the label you set on a session through the session commands', async () => {
  const ctx = await setupTest();
  const listed = await runHostCommand(ctx.configPath, ['sessions']);

  const [session] = z.tuple([z.object({ sessionID: z.string() })]).parse(JSON.parse(listed.stdout));

  const labelled = await runHostCommand(ctx.configPath, [
    'session-label',
    session.sessionID,
    'work',
    'PC',
  ]);

  ctx.model.addReplies({ text: 'Hello.' });

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hi.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await ctx.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Hello.');
  });

  const sent = JSON.stringify(
    ctx.model.requests.findLast((request) => request.path === '/v1/messages')?.body?.messages,
  );

  expect(JSON.parse(labelled.stdout)).toStrictEqual({
    sessionID: session.sessionID,
    label: 'work PC',
  });

  expect(sent).toMatch(
    /\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, Sydney · work PC\] Hi\./u,
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

test('it applies a remembered fact cited by the event ID its stamp showed, with no log read, against that message alone', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Got it.' });

  await sendClientMessage(
    ctx.client,
    { text: 'My bike lock code is 3906.', spans: [{ start: 0, end: 26, source: 'typed' }] },
    'Got it.',
  );

  // the model reads the event ID at the head of the stamp of the message it was sent
  const sent = JSON.stringify(
    ctx.model.requests.findLast((request) => request.path === '/v1/messages'),
  );

  const eventID = Number(
    /\[#(?<eventID>\d+) · [^\]]+\] My bike lock/u.exec(sent)?.groups?.['eventID'],
  );

  // no log.read call: the newer message holds the same words, so only the event ID picks the older
  ctx.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: {
          text: 'Bike lock code 3906',
          quote: 'bike lock code is 3906',
          eventID: `#${eventID}`,
        },
      },
    },
    { toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } } },
    { text: 'Saved.' },
  );

  await sendClientMessage(
    ctx.client,
    {
      text: 'Remember my bike lock code is 3906.',
      spans: [{ start: 0, end: 35, source: 'typed' }],
    },
    'Saved.',
  );

  ctx.sendSignal('SIGTERM');

  const run = await ctx.waitForExit();

  // the quote's span in the older message: characters 3 to 25
  expect(run.records.filter((record) => record.kind === 'memory.version_added')).toMatchObject([
    { payload: { source: 'owner', evidence: { recordSequence: eventID, start: 3, end: 25 } } },
  ]);
}, 60_000);

test('it keeps the ratings the model gives two retrieved items against the turn that retrieved them', async () => {
  const ctx = await setupTest();

  // retrieval scores a word by how few items hold it, so memory holds 3 items beside the 2 rated
  const quotes = [
    'boiler code is 4471',
    'bins go out on Tuesday',
    'cat eats at six',
    'car is due in March',
    'bulbs are in the hall',
  ];

  ctx.model.addReplies(...buildCheckedRememberReplies(quotes), { text: 'Noted all five.' });

  const remembered = await sendClientMessage(
    ctx.client,
    {
      text: `Remember that ${quotes.join(', ')}.`,
      spans: [{ start: 0, end: 119, source: 'typed' }],
    },
    'Noted all five.',
  );

  const [boilerID, binsID] = remembered.flatMap(
    (record) =>
      z.object({ result: z.object({ itemID: z.string() }) }).safeParse(record.toolCall?.content)
        .data?.result.itemID ?? [],
  );

  const ratings = [
    { item: binsID, verdict: 'helpful' },
    { item: boilerID, verdict: 'noise', note: 'the code had nothing to do with bins' },
  ];

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__memory_rate', input: { ratings } } },
    { text: 'Tuesday.' },
  );

  const records = await sendClientMessage(
    ctx.client,
    { text: 'Which day do the bins go out, and is the boiler code still 4471?' },
    'Tuesday.',
  );

  const turn = records.slice(records.findLastIndex((record) => record.kind === 'owner_message'));

  expect(turn.find((record) => record.kind === 'memory.rated')?.rating).toStrictEqual({
    items: [
      { hasNote: false, itemID: expect.toBeString(), verdict: 'helpful', version: 1 },
      { hasNote: true, itemID: expect.toBeString(), verdict: 'noise', version: 1 },
    ],
    recalledSequence: turn.find((record) => record.kind === 'memory.recalled')?.sequence ?? -1,
  });
}, 60_000);

test('it lists the proposal the model made when the model calls the pending tool', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__memory_remember', input: { text: 'Keeps two cats' } } },
    { text: 'Noted.' },
    { toolUse: { name: 'mcp__nixie__memory_pending', input: {} } },
    { text: 'One proposal waits.' },
  );

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'I keep two cats.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await ctx.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Noted.');
  });

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'What still waits for me?',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await ctx.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'One proposal waits.');
  });

  // the model's request after the call carries the tool's result
  const sent = JSON.stringify(
    ctx.model.requests.findLast((request) => request.path === '/v1/messages')?.body?.messages,
  );

  const page = await ctx.client.conversation.read({ thread: 'conversation' });

  expect(sent).toInclude(
    String.raw`\"change\":\"new\",\"text\":\"Keeps two cats\",\"notedBy\":[\"you noted it\"],\"reason\":\"no_quote\",\"age\":\"under a minute\"`,
  );

  expect(page.records.findLast((record) => record.kind === 'tool_result')?.toolCall).toMatchObject({
    outcome: 'result',
    content: { result: { proposals: [{ proposalID: expect.toBeString() }] } },
  });
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

  expect(JSON.parse(approved.stdout)).toStrictEqual({
    status: 'applied',
    itemID: proposal.itemID,
    version: 1,
  });
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

test('it refuses to start when a pronoun names a settings entry the secrets file lacks, and exits 1', async () => {
  const nixie = await startTestNixie({
    extraConfig: ['owner:', '  pronouns: { they: deployment:owner_they, their: their }'],
    extraSecrets: ['settings:', '  owner_name: Wren Halloway'],
  });

  const exitCode = await nixie.exited;
  const failure = await nixie.waitForLogEvent('command.failed');

  expect(exitCode).toBe(1);

  expect(failure).toMatchObject({
    command: 'serve',
    message: expect.toInclude(
      "the owner's pronoun they is deployment:owner_they, and the secrets file has no settings entry owner_they",
    ),
  });
}, 60_000);

test('it resets the running server through the reset command, which exits 0 with the server', async () => {
  const ctx = await setupTest();
  const reset = await runTestReset(ctx);

  expect(reset.command.exitCode).toBe(0);

  expect(reset.command.stdout).toInclude(
    'Backups from before the reset still hold the old data until they age out.',
  );

  expect(reset.serverExit).toBe(0);
}, 120_000);

test('it keeps a live device signed in across a reset', async () => {
  const ctx = await setupTest();
  const reset = await runTestReset(ctx);
  const listed = await reset.connect(ctx.token).sessions.list();

  expect(listed.sessions.map((session) => session.deviceName)).toStrictEqual(['laptop']);
}, 120_000);

test('it refuses a token revoked before a reset as a stranger', async () => {
  const ctx = await setupTest();
  const issued = await runHostCommand(ctx.configPath, ['enrol-code']);

  const phone = await ctx.signedOut.sessions.enrol({
    clientActionID: crypto.randomUUID(),
    code: issued.stdout.split('\n')[0] ?? '',
    deviceName: 'phone',
    tokenDelivery: 'bearer',
  });

  await ctx.client.sessions.revoke({
    clientActionID: crypto.randomUUID(),
    sessionID: phone.sessionID,
  });

  const reset = await runTestReset(ctx);

  const call = reset.connect(phone.token).sessions.list();

  await Promise.allSettled([call]);

  const run = await reset.stop();

  expect(call).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

  expect(run.records).toIncludeAllPartialMembers([
    {
      kind: 'identity.refused',
      payload: { channel: 'client', externalID: 'unknown-token', refusedAt: expect.toBeNumber() },
    },
  ]);
}, 120_000);

test('it refuses an enrolment code issued before a reset', async () => {
  const ctx = await setupTest();
  const issued = await runHostCommand(ctx.configPath, ['enrol-code']);
  const reset = await runTestReset(ctx);

  const enrol = reset.connect().sessions.enrol({
    clientActionID: crypto.randomUUID(),
    code: issued.stdout.split('\n')[0] ?? '',
    deviceName: 'tablet',
    tokenDelivery: 'bearer',
  });

  await Promise.allSettled([enrol]);

  expect(enrol).rejects.toMatchObject({ code: 'ENROLMENT_CODE_INVALID' });
}, 120_000);

test('it destroys every sandbox in a reset', async () => {
  const ctx = await setupTest();
  const before = await ctx.readSandboxIDs();

  await runTestReset(ctx);

  const after = await ctx.readSandboxIDs();

  expect(before.length).toBeGreaterThan(0);
  expect(after).not.toIncludeAnyMembers(before);
}, 120_000);

test('it leaves no old key and no old text in the data files after a reset', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Fennel-reply-8WD' });

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Kettle-message-3VQ',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await ctx.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Fennel-reply-8WD');
  });

  // every key ID is a UUID, so the key store's files name each key they hold
  const before = await ctx.readDataFiles();

  const keyIDs = before
    .filter((file) => file.name.startsWith('keys.db'))
    .flatMap(
      (file) => file.text.match(/[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[\da-f]{4}-[\da-f]{12}/gu) ?? [],
    );

  await runTestReset(ctx);

  const after = await ctx.readDataFiles();

  expect(keyIDs.length).toBeGreaterThan(0);

  expect(
    after.filter(
      (file) =>
        /Kettle-message-3VQ|Fennel-reply-8WD/u.test(file.text) ||
        keyIDs.some((keyID) => file.text.includes(keyID)),
    ),
  ).toStrictEqual([]);
}, 120_000);

test('it gives a live stream that resumes from the old last sequence the reset as its next record', async () => {
  const ctx = await setupTest();
  const reset = await runTestReset(ctx);

  const connection = await reset
    .connect(ctx.token)
    .records.follow({ afterSequence: reset.lastSequence, thread: 'conversation' });

  const next = await connection.next();

  await connection.return(undefined);

  invariant(next.done !== true);

  expect(next.value.record).toMatchObject({
    kind: 'log_reset',
    sequence: reset.lastSequence + 2,
    thread: 'conversation',
  });
}, 120_000);

test('it starts the next turn after a reset with no history', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Fennel-reply-8WD' }, { text: 'Hello again.' });

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Kettle-message-3VQ',
    thread: 'conversation',
  });

  await waitForCondition(() =>
    ctx.model.requests.some((request) => request.path === '/v1/messages'),
  );

  const reset = await runTestReset(ctx);

  await reset.connect(ctx.token).conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Lantern-message-6HN',
    thread: 'conversation',
  });

  await waitForCondition(() =>
    JSON.stringify(ctx.model.requests.at(-1)?.body).includes('Lantern-message-6HN'),
  );

  expect(JSON.stringify(ctx.model.requests.at(-1)?.body?.messages)).not.toMatch(
    /Kettle-message-3VQ|Fennel-reply-8WD/u,
  );
}, 120_000);
