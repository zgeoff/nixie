import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createTestClient } from './test-utils/create-test-client';
import { runHostCommand } from './test-utils/run-host-command';
import { runTestReset } from './test-utils/run-test-reset';
import { sendClientMessage } from './test-utils/send-client-message';
import { startInProcessNixie } from './test-utils/start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie();

  return nixie;
}

test('it keeps no message text in nixie.db, the key store or the log events', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies({ text: 'Quince-reply-4ZT9' });

  await sendClientMessage(api.client, { text: 'Plum-message-7QK2' }, 'Quince-reply-4ZT9');

  ctx.signalStop();

  await ctx.waitForExit();

  const files = await ctx.readDataFiles();

  expect(files.map((file) => file.name)).toIncludeAllMembers(['nixie.db', 'keys.db']);

  expect(
    files.filter((file) => /Plum-message-7QK2|Quince-reply-4ZT9/u.test(file.text)),
  ).toStrictEqual([]);

  expect(JSON.stringify(ctx.readLogEvents())).not.toMatch(/Plum-message-7QK2|Quince-reply-4ZT9/u);
});

test('it puts the snapshot hash of the definitions in force on every record', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);
  const seeded = await ctx.waitForLogEvent('definitions.seeded');

  ctx.guest.addReplies({ text: 'Quince-reply-4ZT9' });

  await sendClientMessage(api.client, { text: 'Plum-message-7QK2' }, 'Quince-reply-4ZT9');

  ctx.signalStop();

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
});

test('it offers the memory tools, web fetch, the time tool and the log reader to the conversation guest', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  const gate = Promise.withResolvers<void>();

  ctx.guest.addReplies({ text: 'Hello.', gate: () => gate.promise });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hi.',
    thread: 'conversation',
  });

  await waitForCondition(() => ctx.guest.turns.length === 1);

  const [received] = ctx.guest.received;

  invariant(received);

  const names = await ctx.readToolNames(received);

  gate.resolve();

  expect(names).toIncludeAllMembers([
    'memory.remember',
    'memory.recall',
    'memory.pending',
    'memory.retire',
    'moment.keep',
    'moment.read',
    'web_fetch',
    'time.now',
    'log.read',
    'log.read_image',
    'tasks.list',
    'task.message',
  ]);
});

test('it calls the owner by the name the secrets file holds, which the configuration names by reference', async () => {
  const nixie = await startInProcessNixie({
    extraConfig: ['owner:', '  name: deployment:owner_name'],
    extraSecrets: ['settings:', '  owner_name: Wren Halloway'],
  });

  const signedIn = await createTestClient(nixie);

  nixie.guest.addReplies({ text: 'Hello.' });

  await sendClientMessage(signedIn.client, { text: 'Hi.' }, 'Hello.');

  expect(nixie.guest.turns).toMatchObject([
    { systemPrompt: expect.toInclude("blocks in Wren Halloway's messages") },
  ]);
});

test('it answers the time tool in the zone of the newest message', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies(
    { text: 'Safe travels.' },
    { toolUse: { name: 'time.now', input: {} } },
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
});

test('it answers a message with a reply that used a tool, with each step in the event log', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies(
    { toolUse: { name: 'time.now', input: {} } },
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
});

test('it shows the model when each message was sent, in its own zone or the default one', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies({ text: 'Hello.' }, { text: 'Welcome to Tokyo.' });

  await sendClientMessage(api.client, { text: 'Hi.' }, 'Hello.');

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

  expect(ctx.guest.turns).toMatchObject([
    {
      input: [
        {
          text: expect.stringMatching(
            /\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, Sydney · laptop\] Hi\.$/u,
          ),
        },
      ],
    },
    {
      input: [
        {
          text: expect.stringMatching(
            /\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, Tokyo · laptop\] Just landed\.$/u,
          ),
        },
      ],
    },
  ]);
});

test('it shows the model when you typed a message that reached nixie over 2 minutes late', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies({ text: 'Noted.' }, { text: 'On it.' });

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

  expect(ctx.guest.turns).toMatchObject([
    {
      input: [
        {
          text: expect.stringMatching(
            /\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, Tokyo · laptop\] Back home\.$/u,
          ),
        },
      ],
    },
    {
      input: [
        {
          text: expect.stringMatching(
            /\[#\d+ · typed (?:\w{3} \d{1,2} \w{3}(?: \d{4})?, )?\d{2}:\d{2}, sent \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, Tokyo · laptop\] Book the dentist\.$/u,
          ),
        },
      ],
    },
  ]);
});

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

  ctx.guest.addReplies({ text: 'Hello.' });

  await sendClientMessage(api.client, { text: 'Hi.' }, 'Hello.');

  expect(JSON.parse(labelled.stdout)).toStrictEqual({
    sessionID: session.sessionID,
    label: 'work PC',
  });

  expect(ctx.guest.turns).toMatchObject([
    {
      input: [
        {
          text: expect.stringMatching(
            /\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, Sydney · work PC\] Hi\.$/u,
          ),
        },
      ],
    },
  ]);
});

test('it applies a remembered fact that the owner typed, with their words as its evidence', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies(
    {
      toolUse: {
        name: 'memory.remember',
        input: { text: 'Sister Ada lives in Leeds', quote: 'my sister Ada lives in Leeds' },
      },
    },
    { text: 'Noted.' },
  );

  ctx.guest.addCheckAnswers({ verdict: 'asserted', reason: 'Stated.' });

  await sendClientMessage(
    api.client,
    {
      text: 'Remember that my sister Ada lives in Leeds.',
      spans: [{ start: 0, end: 43, source: 'typed' }],
    },
    'Noted.',
  );

  ctx.signalStop();

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
});

test('it applies a remembered fact cited by the event ID its stamp showed, with no log read, against that message alone', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies({ text: 'Got it.' });

  await sendClientMessage(
    api.client,
    { text: 'My bike lock code is 3906.', spans: [{ start: 0, end: 26, source: 'typed' }] },
    'Got it.',
  );

  const eventID = Number(
    /\[#(?<eventID>\d+) · [^\]]+\] My bike lock/u.exec(JSON.stringify(ctx.guest.turns))?.groups?.[
      'eventID'
    ],
  );

  ctx.guest.addReplies(
    {
      toolUse: {
        name: 'memory.remember',
        input: {
          text: 'Bike lock code 3906',
          quote: 'bike lock code is 3906',
          eventID: `#${eventID}`,
        },
      },
    },
    { text: 'Saved.' },
  );

  ctx.guest.addCheckAnswers({ verdict: 'asserted', reason: 'Stated.' });

  await sendClientMessage(
    api.client,
    {
      text: 'Remember my bike lock code is 3906.',
      spans: [{ start: 0, end: 35, source: 'typed' }],
    },
    'Saved.',
  );

  ctx.signalStop();

  const run = await ctx.waitForExit();

  expect(run.records.filter((record) => record.kind === 'memory.version_added')).toMatchObject([
    { payload: { source: 'owner', evidence: { recordSequence: eventID, start: 3, end: 25 } } },
  ]);
});

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

  ctx.guest.addReplies(
    ...quotes.map((quote) => ({
      toolUse: { name: 'memory.remember', input: { text: quote, quote } },
    })),
    { text: 'Noted all five.' },
  );

  ctx.guest.addCheckAnswers(...quotes.map(() => ({ verdict: 'asserted', reason: 'Stated.' })));

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

  ctx.guest.addReplies(
    { toolUse: { name: 'memory.rate', input: { ratings } } },
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
});

test('it lists the proposal the model made when the model calls the pending tool', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies(
    { toolUse: { name: 'memory.remember', input: { text: 'Keeps two cats' } } },
    { text: 'Noted.' },
    { toolUse: { name: 'memory.pending', input: {} } },
    { text: 'One proposal waits.' },
  );

  await sendClientMessage(api.client, { text: 'I keep two cats.' }, 'Noted.');

  const records = await sendClientMessage(
    api.client,
    { text: 'What still waits for me?' },
    'One proposal waits.',
  );

  const pending = ctx.toolResults.at(-1);

  invariant(pending);

  const answer: unknown = JSON.parse(pending.result);

  expect(pending.name).toBe('memory.pending');

  expect(answer).toMatchObject({
    structuredContent: {
      proposals: [
        {
          proposalID: expect.toBeString(),
          change: 'new',
          text: 'Keeps two cats',
          notedBy: ['you noted it'],
          subject: 'owner',
          reason: 'no_quote',
          age: 'under a minute',
        },
      ],
    },
  });

  expect(records.findLast((record) => record.kind === 'tool_result')?.toolCall).toMatchObject({
    outcome: 'result',
    content: { result: { proposals: [{ proposalID: expect.toBeString() }] } },
  });
});

test('it runs the turn after you forget a message the live session holds on a rebuilt session without its text', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies({ text: 'Noted-reply-2KC' }, { text: 'Welcome-reply-9TB' });

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

  expect(JSON.stringify(ctx.guest.turns.at(-1))).toSatisfy(
    (turn: string) =>
      turn.includes('Thanks.') &&
      turn.includes('Noted-reply-2KC') &&
      !turn.includes('Lilac-message-5JX'),
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
});

test('it keeps the text of a forgotten message in no data file', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies({ text: 'Noted-reply-2KC' });

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

  ctx.signalStop();

  await ctx.waitForExit();

  const files = await ctx.readDataFiles();

  expect(files.filter((file) => file.text.includes('Lilac-message-5JX'))).toStrictEqual([]);
});

test('it starts the memory writer with the batch gate, its catch-up from the first record', async () => {
  const ctx = await setupTest();
  const started = await ctx.waitForLogEvent('memory_writer.started');

  expect(started).toMatchObject({ cursor: 0, startSequence: expect.toBeNumber() });
  expect(ctx.readLogEvents()).not.toPartiallyContain({ event: 'memory_writer.off' });
});

test('it starts the memory consolidator when the configuration leaves out its enabled key', async () => {
  const ctx = await setupTest();
  const started = await ctx.waitForLogEvent('memory_consolidator.started');

  expect(started).toMatchObject({ periodMs: 604_800_000 });
  expect(ctx.readLogEvents()).not.toPartiallyContain({ event: 'memory_consolidator.off' });
});

test('it never starts the memory writer the configuration turns off, and a turn files nothing for it', async () => {
  const nixie = await startInProcessNixie({
    extraConfig: ['memory_writer: { enabled: false, batch_messages: 1 }'],
  });

  const api = await createTestClient(nixie);

  await nixie.waitForLogEvent('memory_writer.off');

  nixie.guest.addReplies({ text: 'Noted: the ferry leaves at nine.' });

  await sendClientMessage(
    api.client,
    { text: 'The ferry to the island leaves at nine.' },
    'Noted: the ferry leaves at nine.',
  );

  nixie.signalStop();

  const exited = await nixie.waitForExit();

  expect(exited.records.filter((record) => record.thread === 'memory-writer')).toStrictEqual([]);
  expect(nixie.readLogEvents()).not.toPartiallyContain({ event: 'memory_writer.started' });
});

test('it never runs the memory consolidator the configuration turns off', async () => {
  const nixie = await startInProcessNixie({
    extraConfig: ['memory_consolidation: { enabled: false }'],
  });

  await nixie.waitForLogEvent('memory_consolidator.off');
  await nixie.waitForLogEvent('ready');

  nixie.signalStop();

  const exited = await nixie.waitForExit();

  expect(exited.records.filter((record) => record.thread === 'memory-consolidator')).toStrictEqual(
    [],
  );

  expect(nixie.readLogEvents()).not.toPartiallyContain({ event: 'memory_consolidator.started' });
});

test('it reports the memory writer and consolidator the configuration turns off as off to a device', async () => {
  const nixie = await startInProcessNixie({
    extraConfig: ['memory_writer: { enabled: false }', 'memory_consolidation: { enabled: false }'],
  });

  const api = await createTestClient(nixie);
  const writer = await api.client.memory.writerStatus();
  const consolidator = await api.client.memory.consolidatorStatus();

  expect(writer.isEnabled).toBeFalse();
  expect(consolidator).toStrictEqual({ isEnabled: false });
});

test('it queues one action for the log-only connector at start, which the action runners log', async () => {
  const nixie = await startInProcessNixie();

  await nixie.waitForLogEvent('action.logged');

  expect(nixie.readLogEvents().filter((logged) => logged.event === 'action.logged')).toMatchObject([
    { event: 'action.logged', actionID: expect.toBeString(), attempt: 1 },
  ]);
});

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
});

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
});

test('it fails a turn the model API refused for its credential with no reply, and reports the turns as not ready', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies({ modelAuthRefusal: 'invalid x-api-key' });

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
});

test('it stops claiming steps on a stop signal, lets the turn in flight commit and exits 0', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  const gate = Promise.withResolvers<void>();

  ctx.guest.addReplies({ text: 'Held-reply', gate: () => gate.promise });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hello.',
    thread: 'conversation',
  });

  await waitForCondition(() => ctx.guest.turns.length === 1);

  ctx.signalStop();

  await ctx.waitForLogEvent('stopping');

  gate.resolve();

  const run = await ctx.waitForExit();

  expect(run.exitCode).toBe(0);

  expect(run.records).toIncludeAllPartialMembers([
    { kind: 'model.reply', erasable: { status: 'readable', fields: { text: 'Held-reply' } } },
  ]);
});

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
});

test('it lists a pending memory proposal and approves it through the memory commands', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies(
    { toolUse: { name: 'memory.remember', input: { text: 'Likes jazz' } } },
    { text: 'Noted.' },
  );

  await sendClientMessage(api.client, { text: 'I like jazz.' }, 'Noted.');

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
});

test('it shows the conversation your reason for a proposal you rejected in the web client on its next turn', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies(
    { toolUse: { name: 'memory.remember', input: { text: 'Plays squash daily' } } },
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

  expect(ctx.guest.turns.at(-1)?.input).toMatchObject([
    {
      text: expect.toInclude(
        `rejected your memory proposal ${proposal.proposalID}. Reason: "only on weekends, not every day".`,
      ),
    },
  ]);
});

test('it logs no info event, its stop included, at the warn level the configuration sets', async () => {
  const nixie = await startInProcessNixie({ logLevel: 'warn' });

  await waitForCondition(async () => {
    const files = await nixie.readDataFiles();

    return files.some((file) => file.name === 'nixie.db');
  });

  nixie.signalStop();

  const exitCode = await nixie.exited;

  expect(exitCode).toBe(0);

  expect(
    nixie.readLogEvents().filter((logged) => logged.level === 'info' || logged.level === 'debug'),
  ).toStrictEqual([]);
});

test('it logs its info events, its stop included, at the default level', async () => {
  const nixie = await startInProcessNixie();

  await nixie.waitForLogEvent('ready');

  nixie.signalStop();

  const exitCode = await nixie.exited;

  expect(exitCode).toBe(0);
  expect(nixie.readLogEvents()).toPartiallyContain({ event: 'stopped', level: 'info' });
});

test('it refuses to start on a key no module reads, and exits 1', async () => {
  const nixie = await startInProcessNixie({ extraConfig: ['tasks:', '  runner: 5'] });
  const exitCode = await nixie.exited;
  const failure = await nixie.waitForLogEvent('command.failed');

  expect(exitCode).toBe(1);

  expect(failure).toMatchObject({
    command: 'serve',
    message: expect.toInclude('tasks: Unrecognized key: "runner"'),
  });
});

test('it refuses to start when a pronoun names a settings entry the secrets file lacks, and exits 1', async () => {
  const nixie = await startInProcessNixie({
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
});

test('it resets the running server through the reset command, which exits 0 with the server', async () => {
  const ctx = await setupTest();

  await createTestClient(ctx);

  const reset = await runTestReset(ctx);

  expect(reset.command.exitCode).toBe(0);

  expect(reset.command.stdout).toInclude(
    'Backups from before the reset still hold the old data until they age out.',
  );

  expect(reset.serverExit).toBe(0);
});

test('it keeps a live device signed in across a reset', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);
  const reset = await runTestReset(ctx);
  const listed = await reset.connect(api.token).sessions.list();

  expect(listed.sessions.map((session) => session.deviceName)).toStrictEqual(['laptop']);
});

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
});

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
});

test('it destroys every sandbox in a reset', async () => {
  const ctx = await setupTest();

  await createTestClient(ctx);

  const before = ctx.guest.readSandboxIDs();

  await runTestReset(ctx);

  const after = ctx.guest.readSandboxIDs();

  expect(before.length).toBeGreaterThan(0);
  expect(after).not.toIncludeAnyMembers(before);
});

test('it leaves no old key and no old text in the data files after a reset', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies({ text: 'Fennel-reply-8WD' });

  await sendClientMessage(api.client, { text: 'Kettle-message-3VQ' }, 'Fennel-reply-8WD');

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
});

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
});

test('it starts the next turn after a reset with no session to resume', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies({ text: 'Fennel-reply-8WD' }, { text: 'Hello again.' });

  await sendClientMessage(api.client, { text: 'Kettle-message-3VQ' }, 'Fennel-reply-8WD');

  const reset = await runTestReset(ctx);

  await sendClientMessage(
    reset.connect(api.token),
    { text: 'Lantern-message-6HN' },
    'Hello again.',
  );

  expect(ctx.guest.turns.at(-1)).toMatchObject({
    resume: null,
    input: [{ text: expect.toInclude('Lantern-message-6HN') }],
  });

  expect(ctx.guest.collectFilesWithText('Kettle-message-3VQ')).toStrictEqual([]);
});

test('it forgets every memory item through a reset of the memories, and keeps the conversation', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies(
    {
      toolUse: {
        name: 'memory.remember',
        input: { text: 'Brother Tomas keeps goats', quote: 'my brother Tomas keeps goats' },
      },
    },
    { text: 'Noted-reply-2HX' },
  );

  ctx.guest.addCheckAnswers({ verdict: 'asserted', reason: 'Stated.' });

  await sendClientMessage(
    api.client,
    {
      text: 'Remember that my brother Tomas keeps goats.',
      spans: [{ start: 0, end: 43, source: 'typed' }],
    },
    'Noted-reply-2HX',
  );

  const reset = await runHostCommand(ctx.configPath, ['reset', '--only', 'memories', '--yes']);

  ctx.signalStop();

  const run = await ctx.waitForExit();

  const added = run.records.find((record) => record.kind === 'memory.version_added');

  invariant(added, 'the run added no memory item');

  expect(reset.exitCode).toBe(0);
  expect(reset.stdout).toStartWith('nixie forgot 1 memory items.\n');

  expect(run.records.filter((record) => record.kind === 'memory.forgotten')).toMatchObject([
    { payload: { itemID: added.payload['itemID'] } },
  ]);

  expect(
    run.records.filter(
      (record) => record.kind === 'owner_message' || record.kind === 'model.reply',
    ),
  ).toMatchObject([
    {
      erasable: {
        status: 'readable',
        fields: { text: 'Remember that my brother Tomas keeps goats.' },
      },
    },
    { erasable: { status: 'readable', fields: { text: 'Noted-reply-2HX' } } },
  ]);
});

test('it shreds the conversation through a reset of the conversations, and keeps every memory item', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies(
    {
      toolUse: {
        name: 'memory.remember',
        input: { text: 'Aunt Mira bakes on Sundays', quote: 'my aunt Mira bakes on Sundays' },
      },
    },
    { text: 'Saffron-reply-5JD' },
    { toolUse: { name: 'memory.recall', input: { query: 'Mira bakes' } } },
    { text: 'Hello again.' },
  );

  ctx.guest.addCheckAnswers({ verdict: 'asserted', reason: 'Stated.' });

  await sendClientMessage(
    api.client,
    {
      text: 'Remember that my aunt Mira bakes on Sundays.',
      spans: [{ start: 0, end: 44, source: 'typed' }],
    },
    'Saffron-reply-5JD',
  );

  const reset = await runTestReset(ctx, ['--only', 'conversations', '--yes']);

  await sendClientMessage(
    reset.connect(api.token),
    { text: 'Lantern-message-6HN' },
    'Hello again.',
  );

  const run = await reset.stop();

  const recalled = ctx.toolResults.at(-1);

  const turn = ctx.guest.turns.find((received) =>
    JSON.stringify(received.input).includes('Lantern-message-6HN'),
  );

  invariant(recalled && turn);

  expect(reset.command.exitCode).toBe(0);
  expect(reset.serverExit).toBe(0);
  expect(turn.resume).toBeNull();
  expect(JSON.stringify(turn.input)).not.toMatch(/aunt Mira|Saffron-reply-5JD|since forgotten/u);
  expect(recalled.result).toInclude('Aunt Mira bakes on Sundays');

  expect(
    run.records
      .filter((record) => record.kind === 'owner_message' || record.kind === 'model.reply')
      .map((record) => record.erasable),
  ).toMatchObject([
    { status: 'shredded' },
    { status: 'shredded' },
    { status: 'readable', fields: { text: 'Lantern-message-6HN' } },
    { status: 'readable', fields: { text: 'Hello again.' } },
  ]);

  expect(run.records.filter((record) => record.kind === 'memory.forget_started')).toStrictEqual([]);
});
