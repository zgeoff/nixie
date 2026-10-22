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

async function setupTest() {
  const nixie = await startTestNixie();

  return nixie;
}

test('it keeps no message text in nixie.db, the key store or the logs', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.model.addReplies({ text: 'Quince-reply-4ZT9' });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Plum-message-7QK2',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

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
  const api = await createTestClient(ctx);
  const seeded = await ctx.waitForLogEvent('definitions.seeded');

  ctx.model.addReplies({ text: 'Quince-reply-4ZT9' });

  await api.client.conversation.send({
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
  const api = await createTestClient(ctx);

  ctx.model.addReplies({ text: 'Hello.' });

  await api.client.conversation.send({
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
  const api = await createTestClient(ctx);

  ctx.model.addReplies(
    { text: 'Safe travels.' },
    { toolUse: { name: 'mcp__nixie__time_now', input: {} } },
    { text: 'It is evening in London.' },
  );

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Flying out of Tokyo tonight.',
    thread: 'conversation',
    timeZone: 'Asia/Tokyo',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Safe travels.');
  });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Landed. What time is it here?',
    thread: 'conversation',
    timeZone: 'Europe/London',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'It is evening in London.');
  });

  const page = await api.client.conversation.read({ thread: 'conversation' });

  expect(page.records.find((record) => record.kind === 'tool_result')?.toolCall).toMatchObject({
    outcome: 'result',
    content: { result: { timeZone: 'Europe/London', timeZoneFrom: 'message' } },
  });
}, 60_000);

test('it answers a message with a reply that used a tool, with each step in the event log', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__time_now', input: {} } },
    { text: 'It is a quarter past four in Lisbon.' },
  );

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'What time is it in Lisbon?',
    thread: 'conversation',
    timeZone: 'Europe/Lisbon',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => /^task\.step_(?:committed|errored)$/u.test(record.kind));
  });

  const page = await api.client.conversation.read({ thread: 'conversation' });

  expect(page.records.map((record) => record.kind)).toStrictEqual([
    'task.created',
    'owner_message',
    'task.step_started',
    'skills.pinned',
    'memory.recalled',
    'tool_called',
    'tool_result',
    'model.session_opened',
    'model.reply',
    'model.turn_ended',
    'task.step_committed',
  ]);

  expect(
    page.records
      .filter((record) => record.kind.startsWith('tool_'))
      .map((record) => record.toolCall),
  ).toMatchObject([
    { tool: 'time.now', input: {} },
    {
      outcome: 'result',
      content: { result: { timeZone: 'Europe/Lisbon', timeZoneFrom: 'message' } },
    },
  ]);

  expect(page.records.find((record) => record.kind === 'model.reply')?.message?.text).toBe(
    'It is a quarter past four in Lisbon.',
  );

  expect(JSON.stringify(ctx.model.requests.at(-1)?.body?.messages)).toMatch(
    /"type":"tool_result".*Europe\/Lisbon/u,
  );
}, 60_000);

test('it completes a turn that calls a tool from the test sandbox the configuration selects', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__time_now', input: {} } },
    { text: 'It is just past noon in Reykjavik.' },
  );

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'What time is it in Reykjavik?',
    thread: 'conversation',
    timeZone: 'Atlantic/Reykjavik',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => /^task\.step_(?:committed|errored)$/u.test(record.kind));
  });

  const page = await api.client.conversation.read({ thread: 'conversation' });
  const sandboxIDs = await ctx.readSandboxIDs();

  expect(sandboxIDs.length).toBeGreaterThan(0);
  expect(page.records.at(-1)?.kind).toBe('task.step_committed');

  expect(page.records.find((record) => record.kind === 'tool_result')?.toolCall).toMatchObject({
    outcome: 'result',
    content: { result: { timeZone: 'Atlantic/Reykjavik' } },
  });

  expect(page.records.find((record) => record.kind === 'model.reply')?.message?.text).toBe(
    'It is just past noon in Reykjavik.',
  );
}, 60_000);

test('it shows the model when each message was sent, in its own zone or the default one', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.model.addReplies({ text: 'Hello.' }, { text: 'Welcome to Tokyo.' });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hi.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Hello.');
  });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Just landed.',
    thread: 'conversation',
    timeZone: 'Asia/Tokyo',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

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

test('it shows the model when you typed a message that reached nixie over 2 minutes late', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.model.addReplies({ text: 'Noted.' }, { text: 'On it.' });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Back home.',
    thread: 'conversation',
    timeZone: 'Asia/Tokyo',
    writtenAt: new Date().toISOString(),
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Noted.');
  });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Book the dentist.',
    thread: 'conversation',
    timeZone: 'Asia/Tokyo',
    writtenAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'On it.');
  });

  const sent = JSON.stringify(
    ctx.model.requests.findLast((request) => request.path === '/v1/messages')?.body?.messages,
  );

  expect(sent).toMatch(
    /\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, Tokyo · laptop\] Back home\./u,
  );

  expect(sent).toMatch(
    /\[#\d+ · typed (?:\w{3} \d{1,2} \w{3}(?: \d{4})?, )?\d{2}:\d{2}, sent \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, Tokyo · laptop\] Book the dentist\./u,
  );
}, 60_000);

test('it shows the model the label you set on a session through the session commands', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);
  const listed = await runHostCommand(ctx.configPath, ['sessions']);

  const [session] = z.tuple([z.object({ sessionID: z.string() })]).parse(JSON.parse(listed.stdout));

  const labelled = await runHostCommand(ctx.configPath, [
    'session-label',
    session.sessionID,
    'work',
    'PC',
  ]);

  ctx.model.addReplies({ text: 'Hello.' });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hi.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

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
  const api = await createTestClient(ctx);

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

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [{ start: 0, end: 43, source: 'typed' }],
    text: 'Remember that my sister Ada lives in Leeds.',
    thread: 'conversation',
  });

  await waitForCondition(
    async () => {
      const page = await api.client.conversation.read({ thread: 'conversation' });

      return page.records.some((record) => record.message?.text === 'Noted.');
    },
    { timeoutMs: 30_000 },
  );

  ctx.sendSignal('SIGTERM');

  const run = await ctx.waitForExit();

  const message = run.records.find((record) => record.kind === 'owner_message');

  invariant(message, 'the run recorded no owner message');

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
  const api = await createTestClient(ctx);

  ctx.model.addReplies({ text: 'Got it.' });

  await sendClientMessage(
    api.client,
    { text: 'My bike lock code is 3906.', spans: [{ start: 0, end: 26, source: 'typed' }] },
    'Got it.',
  );

  const sent = JSON.stringify(
    ctx.model.requests.findLast((request) => request.path === '/v1/messages'),
  );

  const eventID = Number(
    /\[#(?<eventID>\d+) · [^\]]+\] My bike lock/u.exec(sent)?.groups?.['eventID'],
  );

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
    api.client,
    {
      text: 'Remember my bike lock code is 3906.',
      spans: [{ start: 0, end: 35, source: 'typed' }],
    },
    'Saved.',
  );

  ctx.sendSignal('SIGTERM');

  const run = await ctx.waitForExit();

  expect(run.records.filter((record) => record.kind === 'memory.version_added')).toMatchObject([
    { payload: { source: 'owner', evidence: { recordSequence: eventID, start: 3, end: 25 } } },
  ]);
}, 60_000);

test('it keeps the ratings the model gives two retrieved items against the turn that retrieved them', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

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
    api.client,
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
    api.client,
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
  const api = await createTestClient(ctx);

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__memory_remember', input: { text: 'Keeps two cats' } } },
    { text: 'Noted.' },
    { toolUse: { name: 'mcp__nixie__memory_pending', input: {} } },
    { text: 'One proposal waits.' },
  );

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'I keep two cats.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Noted.');
  });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'What still waits for me?',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'One proposal waits.');
  });

  const sent = JSON.stringify(
    ctx.model.requests.findLast((request) => request.path === '/v1/messages')?.body?.messages,
  );

  const page = await api.client.conversation.read({ thread: 'conversation' });

  expect(sent).toInclude(
    String.raw`\"change\":\"new\",\"text\":\"Keeps two cats\",\"notedBy\":[\"you noted it\"],\"subject\":\"owner\",\"reason\":\"no_quote\",\"age\":\"under a minute\"`,
  );

  expect(page.records.findLast((record) => record.kind === 'tool_result')?.toolCall).toMatchObject({
    outcome: 'result',
    content: { result: { proposals: [{ proposalID: expect.toBeString() }] } },
  });
}, 60_000);

test('it runs the turn after you forget a message the live session holds on a rebuilt session without its text', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.model.addReplies({ text: 'Noted-reply-2KC' }, { text: 'Welcome-reply-9TB' });

  const before = await sendClientMessage(
    api.client,
    { text: 'Lilac-message-5JX is the shed code.' },
    'Noted-reply-2KC',
  );

  const message = before.find(
    (record) => record.message?.text.startsWith('Lilac-message-5JX') === true,
  );

  invariant(message);

  await api.client.conversation.forget({
    clientActionID: crypto.randomUUID(),
    sequence: message.sequence,
    thread: 'conversation',
  });

  const after = await sendClientMessage(api.client, { text: 'Thanks.' }, 'Welcome-reply-9TB');

  const sent = JSON.stringify(
    ctx.model.requests.findLast((request) => request.path === '/v1/messages')?.body,
  );

  expect(sent).toSatisfy(
    (request: string) =>
      request.includes('Thanks.') &&
      request.includes('Noted-reply-2KC') &&
      !request.includes('Lilac-message-5JX'),
  );

  expect(
    after
      .filter((record) => record.sequence > message.sequence)
      .map((record) => record.kind)
      .filter((kind) => kind.startsWith('model.session_') || kind.startsWith('record.')),
  ).toStrictEqual([
    'model.session_opened',
    'record.forget_started',
    'model.session_invalidated',
    'model.session_cleanup_completed',
    'record.forgotten',
    'model.session_opened',
  ]);
}, 60_000);

test('it keeps the text of a forgotten message in no data file', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.model.addReplies({ text: 'Noted-reply-2KC' });

  const records = await sendClientMessage(
    api.client,
    { text: 'Lilac-message-5JX is the shed code.' },
    'Noted-reply-2KC',
  );

  const message = records.find(
    (record) => record.message?.text.startsWith('Lilac-message-5JX') === true,
  );

  invariant(message);

  await api.client.conversation.forget({
    clientActionID: crypto.randomUUID(),
    sequence: message.sequence,
    thread: 'conversation',
  });

  ctx.sendSignal('SIGTERM');

  await ctx.waitForExit();

  const files = await ctx.readDataFiles();

  expect(files.filter((file) => file.text.includes('Lilac-message-5JX'))).toStrictEqual([]);
}, 60_000);

test('it starts the memory writer with the batch gate, its catch-up from the first record', async () => {
  const ctx = await setupTest();
  const started = await ctx.waitForLogEvent('memory_writer.started');

  expect(started).toMatchObject({ cursor: 0, startSequence: expect.toBeNumber() });
  expect(ctx.readOutput()).not.toInclude('memory_writer.off');
}, 60_000);

test('it queues one action for the log-only connector at start, which the action runners log', async () => {
  const nixie = await startTestNixie();

  const readLogged = () =>
    nixie
      .readOutput()
      .split('\n')
      .filter((line) => line.includes('"event":"action.logged"'))
      .map((line) =>
        z
          .object({ event: z.string(), actionID: z.uuid(), attempt: z.number() })
          .loose()
          .parse(JSON.parse(line)),
      );

  await waitForCondition(() => readLogged().length > 0);

  expect(readLogged()).toMatchObject([{ event: 'action.logged', attempt: 1 }]);
}, 60_000);

test('it answers liveness per part', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);
  const live = await fetch(`${api.url}/health/live`);
  const liveReport: unknown = await live.json();

  expect(live.status).toBe(200);

  expect(liveReport).toStrictEqual({
    status: 'ready',
    parts: { process: { isReady: true, reason: null }, database: { isReady: true, reason: null } },
  });
}, 60_000);

test('it answers readiness per part, with the slice 1 parts, the dependency parts and the advisory parts only', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);
  const ready = await fetch(`${api.url}/health/ready`);
  const readyReport: unknown = await ready.json();

  expect(ready.status).toBe(200);

  expect(readyReport).toStrictEqual({
    status: 'ready',
    parts: {
      database: { isReady: true, reason: null },
      definitions: { isReady: true, reason: null },
    },
    dependencies: {
      imp_host: { isReady: true, reason: null },
      conversation_imp: { isReady: true, reason: null },
      disk: { isReady: true, reason: null },
    },
    advisory: {
      conversation_turns: { isReady: true, reason: null },
    },
  });
}, 60_000);

test('it fails a turn the model API refused for its credential with no reply, and reports the turns as not ready', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.model.addReplies({ authFailure: 'invalid x-api-key' });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'What is on my list today?',
    thread: 'conversation',
    timeZone: 'Europe/London',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => /^task\.step_(?:committed|errored)$/u.test(record.kind));
  });

  const page = await api.client.conversation.read({ thread: 'conversation' });
  const ready = await fetch(`${api.url}/health/ready`);
  const readyReport: unknown = await ready.json();

  expect(page.records.map((record) => record.kind)).not.toContain('model.reply');
  expect(page.records.at(-1)?.kind).toBe('task.step_errored');
  expect(ready.status).toBe(200);

  expect(readyReport).toMatchObject({
    status: 'ready',
    advisory: {
      conversation_turns: {
        isReady: false,
        reason: 'the last turn failed, the last because the model API refused the credential',
      },
    },
  });
}, 60_000);

test('it stops claiming steps on SIGTERM, lets the turn in flight commit and exits 0', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  const gate = Promise.withResolvers<void>();

  ctx.model.addReplies({ text: 'Held-reply', gate: gate.promise });

  await api.client.conversation.send({
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
  const api = await createTestClient(ctx);
  const command = await runHostCommand(ctx.configPath, ['enrol-code']);

  const session = await api.signedOut.sessions.enrol({
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
  const api = await createTestClient(ctx);

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__memory_remember', input: { text: 'Likes jazz' } } },
    { text: 'Noted.' },
  );

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'I like jazz.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

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

test('it shows the conversation your reason for a proposal you rejected in the web client on its next turn', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__memory_remember', input: { text: 'Plays squash daily' } } },
    { text: 'Noted.' },
    { text: 'Understood.' },
  );

  await sendClientMessage(api.client, { text: 'I played squash today.' }, 'Noted.');

  const listed = await api.client.memory.listProposals();

  const [proposal] = listed.proposals;

  invariant(proposal);

  await api.client.memory.rejectProposals({
    answers: [
      {
        clientActionID: crypto.randomUUID(),
        proposalID: proposal.proposalID,
        actionHash: proposal.actionHash,
        reason: 'only on weekends, not every day',
      },
    ],
  });

  await sendClientMessage(api.client, { text: 'Did you save the squash thing?' }, 'Understood.');

  const sent = JSON.stringify(
    ctx.model.requests.findLast((request) => request.path === '/v1/messages')?.body?.messages,
  );

  expect(sent).toInclude(
    String.raw`rejected your memory proposal ${proposal.proposalID}. Reason: \"only on weekends, not every day\".`,
  );
}, 60_000);

test('it writes no info event, its stop included, at the warn level the configuration sets', async () => {
  const nixie = await startTestNixie({ logLevel: 'warn' });

  await waitForCondition(async () => {
    const files = await nixie.readDataFiles();

    return files.some((file) => file.name === 'nixie.db');
  });

  nixie.sendSignal('SIGTERM');

  const exitCode = await nixie.exited;

  expect(exitCode).toBe(0);

  expect(
    nixie
      .readOutput()
      .split('\n')
      .filter((line) => line.startsWith('{')),
  ).toStrictEqual([]);
}, 60_000);

test('it writes its info events, its stop included, at the default level', async () => {
  const nixie = await startTestNixie();

  await waitForCondition(async () => {
    const files = await nixie.readDataFiles();

    return files.some((file) => file.name === 'nixie.db');
  });

  nixie.sendSignal('SIGTERM');

  const exitCode = await nixie.exited;

  expect(exitCode).toBe(0);
  expect(nixie.readOutput()).toInclude('"event":"stopped"');
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

  await createTestClient(ctx);

  const reset = await runTestReset(ctx);

  expect(reset.command.exitCode).toBe(0);

  expect(reset.command.stdout).toInclude(
    'Backups from before the reset still hold the old data until they age out.',
  );

  expect(reset.serverExit).toBe(0);
}, 120_000);

test('it keeps a live device signed in across a reset', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);
  const reset = await runTestReset(ctx);
  const listed = await reset.connect(api.token).sessions.list();

  expect(listed.sessions.map((session) => session.deviceName)).toStrictEqual(['laptop']);
}, 120_000);

test('it refuses a token revoked before a reset as a stranger', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);
  const issued = await runHostCommand(ctx.configPath, ['enrol-code']);

  const phone = await api.signedOut.sessions.enrol({
    clientActionID: crypto.randomUUID(),
    code: issued.stdout.split('\n')[0] ?? '',
    deviceName: 'phone',
    tokenDelivery: 'bearer',
  });

  await api.client.sessions.revoke({
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

  await createTestClient(ctx);

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

  await createTestClient(ctx);

  const before = await ctx.readSandboxIDs();

  await runTestReset(ctx);

  const after = await ctx.readSandboxIDs();

  expect(before.length).toBeGreaterThan(0);
  expect(after).not.toIncludeAnyMembers(before);
}, 120_000);

test('it leaves no old key and no old text in the data files after a reset', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.model.addReplies({ text: 'Fennel-reply-8WD' });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Kettle-message-3VQ',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Fennel-reply-8WD');
  });

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
  const api = await createTestClient(ctx);
  const reset = await runTestReset(ctx);

  const connection = await reset
    .connect(api.token)
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
  const api = await createTestClient(ctx);

  ctx.model.addReplies({ text: 'Fennel-reply-8WD' }, { text: 'Hello again.' });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Kettle-message-3VQ',
    thread: 'conversation',
  });

  await waitForCondition(() =>
    ctx.model.requests.some((request) => request.path === '/v1/messages'),
  );

  const reset = await runTestReset(ctx);

  await reset.connect(api.token).conversation.send({
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
