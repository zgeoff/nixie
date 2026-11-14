import { expect, mock, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import invariant from 'tiny-invariant';
import { buildModelStatus } from './build-model-status';
import { buildStartStatus } from './build-start-status';
import { readSessionOpening } from './read-session-opening';
import { buildMockTaskMessageView } from './test-utils/build-mock-task-message-view';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  return { tasks: await startTestTasks() };
}

test('it opens a first session with the pinned memory and the status, in that order, and no summary or recent turns', async () => {
  const ctx = await setupTest();

  const opening = await readSessionOpening(ctx.tasks.context, {
    taskID: 'conversation',
    start: { kind: 'first' },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    brief: null,
    isFirstSession: false,
    inbox: [],
    messaging: buildMockTaskMessageView().messaging,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus(), buildModelStatus()],
  });

  expect(
    [...opening.blocks.join('\n').matchAll(/<system-message type="(?<type>[a-z-]+)"/gu)].map(
      (match) => match.groups?.['type'],
    ),
  ).toStrictEqual(['pinned-memory', 'status']);

  expect(opening.blocks.at(1)).toInclude(
    '- Start: a new session. Earlier history is in the event log.\n- Model: claude-test-1\n',
  );

  expect(opening.record).toStrictEqual({
    kind: 'first',
    reason: null,
    lostSessionID: null,
    summarySequence: null,
    recentRecords: 0,
    recentEvents: 0,
    heldFrom: Number.MAX_SAFE_INTEGER,
    recalledThrough: 0,
    briefSequence: null,
    status: { start: 'first', model: 'claude-test-1' },
  });
});

test('it opens a rebuild with no summary with the pinned memory, the status and the recent turns, in that order', async () => {
  const ctx = await setupTest();

  const [asked] = await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'It came at noon.' },
    },
  ]);

  const opening = await readSessionOpening(ctx.tasks.context, {
    taskID: 'conversation',
    start: { kind: 'rebuild', reason: 'lost', lostSessionID: 'a-lost-session' },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    brief: null,
    isFirstSession: false,
    inbox: [],
    messaging: buildMockTaskMessageView().messaging,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus()],
  });

  expect(
    [...opening.blocks.join('\n').matchAll(/<system-message type="(?<type>[a-z-]+)"/gu)].map(
      (match) => match.groups?.['type'],
    ),
  ).toStrictEqual(['pinned-memory', 'status', 'recent-turns']);

  expect(opening.blocks.at(1)).toInclude(
    '- Start: a rebuild, because the earlier session was lost. Earlier history is in the event log.\n',
  );

  expect(opening.blocks.at(2)).toMatch(
    /\] owner: Did the parcel come\?\n\[[^\]]+\] nixie: It came at noon\.\n<\/system-message/u,
  );

  expect(opening.record).toMatchObject({
    kind: 'rebuild',
    reason: 'lost',
    lostSessionID: 'a-lost-session',
    summarySequence: null,
    recentRecords: 2,
    heldFrom: asked?.sequence,
    status: { start: 'rebuild:lost' },
  });
});

test("it replays a task's message and the reply to it in a rebuilt session's recent turns, with the message's ID", async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        messageID: 'k3vq8m2xpa',
        from: 'planner',
        to: 'conversation',
        kind: 'question',
        replyTo: null,
        onBehalfOf: [],
        hop: 1,
        hopLimit: 20,
        wake: true,
        woke: true,
        source: 'task:planner',
      },
      erasable: { body: 'Which day suits the dentist?' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Thursday.' },
    },
  ]);

  const opening = await readSessionOpening(ctx.tasks.context, {
    taskID: 'conversation',
    start: { kind: 'rebuild', reason: 'lost', lostSessionID: 'a-lost-session' },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    brief: null,
    isFirstSession: false,
    inbox: [],
    messaging: buildMockTaskMessageView().messaging,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus()],
  });

  expect(opening.blocks.at(2)).toMatch(
    /\n<task-message id="k3vq8m2xpa" from="task: planner" kind="question" sent="[^"]+" fence="\w+">\nWhich day suits the dentist\?\n<\/task-message fence="\w+">\n\[[^\]]+\] nixie: Thursday\.\n<\/system-message/u,
  );
});

test('it opens a rebuild after a forget erased the summary with the status that says so, and the turns back to the budget', async () => {
  const ctx = await setupTest();

  const [, summarized] = await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 1 },
      erasable: { text: 'They waited on a parcel.' },
    },
  ]);

  invariant(summarized);

  await removeTestRecordKey(ctx.tasks.context.log, summarized.sequence);

  const opening = await readSessionOpening(ctx.tasks.context, {
    taskID: 'conversation',
    start: { kind: 'rebuild', reason: 'forget', lostSessionID: null },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    brief: null,
    isFirstSession: false,
    inbox: [],
    messaging: buildMockTaskMessageView().messaging,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus()],
  });

  expect(
    [...opening.blocks.join('\n').matchAll(/<system-message type="(?<type>[a-z-]+)"/gu)].map(
      (match) => match.groups?.['type'],
    ),
  ).toStrictEqual(['pinned-memory', 'status', 'recent-turns']);

  expect(opening.blocks.at(1)).toInclude(
    '- Start: a rebuild after a forget. The forget erased the summary of earlier sessions, so the gap is deliberate. Earlier history is in the event log.\n',
  );

  expect(opening.blocks.at(2)).toInclude('] owner: Did the parcel come?\n</system-message');
  expect(opening.record).toMatchObject({ summarySequence: null, recentRecords: 1 });
});

test('it opens with the newest readable summary in its slot and only the turns after the sequence it covers', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 1 },
      erasable: { text: 'They asked after a parcel.' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'It came.' },
    },
  ]);

  const opening = await readSessionOpening(ctx.tasks.context, {
    taskID: 'conversation',
    start: { kind: 'rebuild', reason: 'lost', lostSessionID: null },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    brief: null,
    isFirstSession: false,
    inbox: [],
    messaging: buildMockTaskMessageView().messaging,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus()],
  });

  expect(
    [...opening.blocks.join('\n').matchAll(/<system-message type="(?<type>[a-z-]+)"/gu)].map(
      (match) => match.groups?.['type'],
    ),
  ).toStrictEqual(['pinned-memory', 'status', 'summary', 'recent-turns']);

  expect(opening.blocks.at(2)).toInclude('\nThey asked after a parcel.\n');
  expect(opening.blocks.at(3)).toInclude('] owner: It came.');
  expect(opening.blocks.at(3)).not.toInclude('parcel');
  expect(opening.record).toMatchObject({ summarySequence: 2, recentRecords: 1 });
});

test('it carries the note again over the span from the oldest recent turn through the range the last turn noted, after the recent turns', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'It came at noon.' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { memoryNotedThrough: 3 },
    },
  ]);

  const readTurnNote = mock(() =>
    Promise.resolve({ text: 'REPLAYED NOTE', throughSequence: 3, eventCount: 1 }),
  );

  const opening = await readSessionOpening(ctx.tasks.context, {
    taskID: 'conversation',
    start: { kind: 'rebuild', reason: 'lost', lostSessionID: null },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    brief: null,
    isFirstSession: false,
    inbox: [],
    messaging: buildMockTaskMessageView().messaging,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus()],
    readTurnNote,
  });

  expect(readTurnNote).toHaveBeenCalledExactlyOnceWith({
    span: { after: 0, through: 3 },
    isNewSession: true,
  });

  expect(opening.blocks.at(-1)).toBe('REPLAYED NOTE');
  expect(opening.record.recentEvents).toBe(1);
});

test('it starts the span where the note of the oldest kept turn started, so an event noted with that turn comes along', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { memoryNotedThrough: 1 },
    },
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 1 },
      erasable: { text: 'They asked after a parcel.' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { memoryNotedThrough: 4 },
    },
  ]);

  const readTurnNote = mock(() =>
    Promise.resolve({ text: 'REPLAYED NOTE', throughSequence: 4, eventCount: 0 }),
  );

  await readSessionOpening(ctx.tasks.context, {
    taskID: 'conversation',
    start: { kind: 'rebuild', reason: 'lost', lostSessionID: null },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    brief: null,
    isFirstSession: false,
    inbox: [],
    messaging: buildMockTaskMessageView().messaging,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus()],
    readTurnNote,
  });

  expect(readTurnNote).toHaveBeenCalledExactlyOnceWith({
    span: { after: 1, through: 4 },
    isNewSession: true,
  });
});

test('it carries no note again for a session with no recent turn', async () => {
  const ctx = await setupTest();

  const readTurnNote = mock(() =>
    Promise.resolve({ text: 'REPLAYED NOTE', throughSequence: 3, eventCount: 1 }),
  );

  await readSessionOpening(ctx.tasks.context, {
    taskID: 'conversation',
    start: { kind: 'first' },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    brief: null,
    isFirstSession: false,
    inbox: [],
    messaging: buildMockTaskMessageView().messaging,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus()],
    readTurnNote,
  });

  expect(readTurnNote).not.toHaveBeenCalled();
});

test("it pins a started task's brief after the status and before the summary when a rebuilt session holds it in no recent turn, and records its sequence", async () => {
  const ctx = await setupTest();

  const opening = await readSessionOpening(ctx.tasks.context, {
    taskID: 't4m2',
    start: { kind: 'rebuild', reason: 'lost', lostSessionID: 'a-lost-session' },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    brief: {
      origin: 'message',
      messageID: 'm7k2',
      from: 'conversation',
      sequence: 16_031,
      sentAt: new Date('2026-11-05T17:39:00Z'),
      body: 'Find 3 quiet cafes near the station.',
    },
    isFirstSession: false,
    inbox: [],
    messaging: buildMockTaskMessageView().messaging,
    times: { defaultZone: 'UTC', now: new Date('2026-11-05T18:00:00Z') },
    pinnedMemory: null,
    model: 'claude-test-1',
    status: [buildStartStatus()],
  });

  expect(opening.blocks).toHaveLength(2);
  expect(opening.blocks.at(0)).toStartWith('<system-message type="status"');

  expect(opening.blocks.at(1)).toMatch(
    /^<task-message id="m7k2" from="nixie, in the chat with the owner" kind="request" sent="Thu 5 Nov, 17:39, UTC" fence="(?<fence>\w+)">\nFind 3 quiet cafes near the station\.\n<\/task-message fence="\k<fence>">$/u,
  );

  expect(opening.record.briefSequence).toBe(16_031);
});

test("it opens a started task's rebuilt session with the status, then the pinned memory, then the pinned brief", async () => {
  const ctx = await setupTest();

  const opening = await readSessionOpening(ctx.tasks.context, {
    taskID: 't4m2',
    start: { kind: 'rebuild', reason: 'lost', lostSessionID: 'a-lost-session' },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    brief: {
      origin: 'message',
      messageID: 'm7k2',
      from: 'conversation',
      sequence: 16_031,
      sentAt: new Date('2026-11-05T17:39:00Z'),
      body: 'Find 3 quiet cafes near the station.',
    },
    isFirstSession: false,
    inbox: [],
    messaging: buildMockTaskMessageView().messaging,
    times: { defaultZone: 'UTC', now: new Date('2026-11-05T18:00:00Z') },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus()],
  });

  expect(
    opening.blocks.map((block) => /^<(?<tag>[a-z-]+)(?: type="(?<type>[a-z-]+)")?/u.exec(block)),
  ).toMatchObject([
    { groups: { tag: 'system-message', type: 'status' } },
    { groups: { tag: 'system-message', type: 'pinned-memory' } },
    { groups: { tag: 'task-message' } },
  ]);
});

test("it leaves a started task's brief out of the opening when the batch holds its record", async () => {
  const ctx = await setupTest();

  const [brief] = await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 't4m2',
      payload: {
        messageID: 'm7k2',
        from: 'conversation',
        to: 't4m2',
        kind: 'request',
        replyTo: null,
        onBehalfOf: [],
        hop: 0,
        hopLimit: 20,
        wake: true,
        woke: true,
        opensWait: false,
        source: 'task:conversation',
      },
      erasable: { body: 'Find 3 quiet cafes near the station.' },
    },
  ]);

  invariant(brief);

  const opening = await readSessionOpening(ctx.tasks.context, {
    taskID: 't4m2',
    start: { kind: 'first' },
    beforeSequence: brief.sequence,
    rebuildTokens: 30_000,
    brief: {
      origin: 'message',
      messageID: 'm7k2',
      from: 'conversation',
      sequence: brief.sequence,
      sentAt: brief.recordedAt,
      body: 'Find 3 quiet cafes near the station.',
    },
    isFirstSession: true,
    inbox: [brief],
    messaging: buildMockTaskMessageView().messaging,
    times: { defaultZone: 'UTC', now: new Date() },
    pinnedMemory: null,
    model: 'claude-test-1',
    status: [buildStartStatus()],
  });

  expect(opening.blocks).toHaveLength(1);
  expect(opening.record.briefSequence).toBe(brief.sequence);
});

test("it renders a started task's brief in the recent turns, in log order, and pins nothing, when the turns hold its record", async () => {
  const ctx = await setupTest();

  const [brief, , reply] = await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 't4m2',
      payload: {
        messageID: 'm7k2',
        from: 'conversation',
        to: 't4m2',
        kind: 'request',
        replyTo: null,
        onBehalfOf: [],
        hop: 0,
        hopLimit: 20,
        wake: true,
        woke: true,
        opensWait: false,
        source: 'task:conversation',
      },
      erasable: { body: 'Find 3 quiet cafes near the station.' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 't4m2',
      payload: {},
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 't4m2',
      erasable: { text: 'On it.' },
    },
  ]);

  invariant(brief && reply);

  const opening = await readSessionOpening(ctx.tasks.context, {
    taskID: 't4m2',
    start: { kind: 'rebuild', reason: 'lost', lostSessionID: 'a-lost-session' },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    brief: {
      origin: 'message',
      messageID: 'm7k2',
      from: 'conversation',
      sequence: brief.sequence,
      sentAt: brief.recordedAt,
      body: 'Find 3 quiet cafes near the station.',
    },
    isFirstSession: false,
    inbox: [],
    messaging: buildMockTaskMessageView().messaging,
    times: { defaultZone: 'UTC', now: new Date() },
    pinnedMemory: null,
    model: 'claude-test-1',
    status: [buildStartStatus()],
  });

  expect(opening.blocks).toHaveLength(2);

  expect(opening.blocks.at(1)).toMatch(
    /^<system-message type="recent-turns"[^>]*>\n[^\n]+\n<task-message id="m7k2"[^>]*>\nFind 3 quiet cafes near the station\.\n<\/task-message fence="\w+">\n\[[^\]]+\] nixie: On it\.\n<\/system-message/u,
  );

  expect(opening.record.briefSequence).toBe(brief.sequence);
});

test('it pins the brief of a task of the release before in a session that is no first, and leaves it to the preamble in the first', async () => {
  const ctx = await setupTest();

  const brief = {
    origin: 'created',
    taskID: 't4m2',
    from: 'conversation',
    sequence: 400,
    sentAt: new Date('2026-11-05T17:39:00Z'),
    body: 'Find 3 quiet cafes near the station.',
  } as const;

  const query = {
    taskID: 't4m2',
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    brief,
    inbox: [],
    messaging: buildMockTaskMessageView().messaging,
    times: { defaultZone: 'UTC', now: new Date('2026-11-05T18:00:00Z') },
    pinnedMemory: null,
    model: 'claude-test-1',
    status: [buildStartStatus()],
  };

  const first = await readSessionOpening(ctx.tasks.context, {
    ...query,
    start: { kind: 'first' },
    isFirstSession: true,
  });

  const rebuilt = await readSessionOpening(ctx.tasks.context, {
    ...query,
    start: { kind: 'rebuild', reason: 'lost', lostSessionID: 'a-lost-session' },
    isFirstSession: false,
  });

  expect(first.blocks).toHaveLength(1);
  expect(rebuilt.blocks).toHaveLength(2);

  expect(rebuilt.blocks.at(1)).toInclude(
    '<task-message id="t4m2" from="nixie, in the chat with the owner"',
  );

  expect(first.record.briefSequence).toBe(400);
  expect(rebuilt.record.briefSequence).toBe(400);
});

test('it gives the same opening for two rebuilds from one log, with the clock, the status lines and the block IDs fixed', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: {
        text: 'Did the parcel come? ref 42',
        spans: [
          { start: 0, end: 21, source: 'typed' },
          { start: 21, end: 27, source: 'pasted' },
        ],
      },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'It came at noon.' },
    },
  ]);

  const query = {
    taskID: 'conversation',
    start: { kind: 'rebuild', reason: null, lostSessionID: null },
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    brief: null,
    isFirstSession: false,
    inbox: [],
    messaging: buildMockTaskMessageView().messaging,
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-11-14T03:00:00Z') },
    pinnedMemory: 'Nothing is pinned in your memory.',
    model: 'claude-test-1',
    status: [buildStartStatus(), buildModelStatus()],
    mintBlockID: () => '6e6978690001',
  } as const;

  const first = await readSessionOpening(ctx.tasks.context, query);
  const second = await readSessionOpening(ctx.tasks.context, query);

  expect(second).toStrictEqual(first);
  expect(first.blocks.at(1)).toInclude('id="6e6978690001"');

  expect(first.blocks.at(2)).toInclude(
    '<pasted id="6e6978690001">ref 42</pasted id="6e6978690001">',
  );

  expect(first.record).toMatchObject({ kind: 'rebuild', reason: null, lostSessionID: null });

  expect(first.blocks.at(1)).toInclude(
    'Start: a rebuild, because the earlier session was not kept.',
  );
});
