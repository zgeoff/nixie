// oxlint-disable zgeoff/test-beside-module -- it tests the readers of several modules, not one
import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { modelSessionOpenedCodec } from '@heynixie/models';
import type { TaskProfile } from '@heynixie/tasks';
import {
  claimTask,
  readStartedTaskIDs,
  readTaskDirectory,
  taskCreatedCodec,
  writeTaskLimitRaise,
} from '@heynixie/tasks';
import { toolCalledCodec, toolResultCodec } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { renderInboxMessage } from './inbox/render-inbox-message';
import { buildMockTaskMessageView } from './test-utils/build-mock-task-message-view';
import { startTestTasks } from './test-utils/start-test-tasks';
import { readSessionMarks } from './utils/read-session-marks';

// A rolled-back server runs on the log its newer self left. This file writes this release's records
// through the generic writer and reads them with the readers a step uses. It imports only symbols
// that exist at the last release's tag too. Later work adds its records here.

async function setupTest() {
  return { tasks: await startTestTasks() };
}

test('it decodes a creation record with a brief message ID and an opening with a brief sequence', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 't4m2',
      payload: {
        taskID: 't4m2',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
        startStep: 'conversation:1',
        options: {
          model: null,
          profile: null,
          persona: 'none',
          memory: 'none',
          tools: [],
          report: 'wake',
          limits: { turns: 25, dollars: 2 },
        },
        briefMessageID: 'm7k2',
      },
      erasable: { name: 'Cafe scout' },
    },
    {
      kind: 'model.session_opened',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 't4m2',
      payload: {
        model: 'claude-test-1',
        profile: 'default',
        kind: 'first',
        reason: null,
        lostSessionID: null,
        summarySequence: null,
        recentRecords: 0,
        recentEvents: 0,
        recalledThrough: 0,
        status: { start: 'first' },
        personaHash: 'sha256:persona',
        policyHash: 'sha256:policy',
        sessionKey: crypto.randomUUID(),
        briefSequence: 2,
      },
    },
  ]);

  const entries = await readRecords(ctx.tasks.context.log, { afterSequence: 0, thread: 't4m2' });

  const [created, opened] = entries.map((entry) => entry.record);

  invariant(created && opened, 'the log holds both records');

  expect(taskCreatedCodec.tryDecodePartial(created.payload)?.taskID).toBe('t4m2');
  expect(modelSessionOpenedCodec.tryDecodePartial(opened.payload)?.model).toBe('claude-test-1');
});

test('it lists a started task in the directory when its creation record holds no brief text', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 't4m2',
      payload: {
        taskID: 't4m2',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
        startStep: 'conversation:1',
        options: {
          model: null,
          profile: null,
          persona: 'none',
          memory: 'none',
          tools: [],
          report: 'wake',
          limits: { turns: 25, dollars: 2 },
        },
        briefMessageID: 'm7k2',
      },
      erasable: { name: 'Cafe scout' },
    },
  ]);

  const directory: readonly TaskProfile[] = [];

  const messaging = await readTaskDirectory(ctx.tasks.context, { directory });

  expect(messaging.directory.map((profile) => profile.taskID)).toStrictEqual(['t4m2']);
});

test('it lists a started task that names a runner, with an envelope and runner options in place of options', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 't5w3',
      payload: {
        taskID: 't5w3',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
        startStep: 'conversation:1',
        runner: 'night-watch',
        envelope: { report: 'wake', limits: { turns: 4, dollars: 1 } },
        runnerOptions: { target: 'build', depth: { levels: [1, 2] } },
        briefMessageID: 'm9k4',
      },
      erasable: { name: 'Night watch' },
    },
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 't6s1',
      payload: {
        taskID: 't6s1',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
        startStep: 'conversation:2',
        runner: 'sandbox',
        options: {
          model: null,
          profile: null,
          persona: 'none',
          memory: 'none',
          tools: [],
          report: 'wake',
          limits: { turns: 25, dollars: 2 },
        },
        briefMessageID: 'm3d8',
      },
      erasable: { name: 'Tide tables' },
    },
  ]);

  const entries = await readRecords(ctx.tasks.context.log, {
    afterSequence: 0,
    kinds: ['task.created'],
  });

  const directory: readonly TaskProfile[] = [];

  const messaging = await readTaskDirectory(ctx.tasks.context, { directory });

  const decoded = entries.map((entry) => taskCreatedCodec.tryDecodePartial(entry.record.payload));

  expect(messaging.directory.map((profile) => profile.taskID)).toStrictEqual(['t5w3', 't6s1']);
  expect(decoded.map((payload) => payload?.taskID)).toStrictEqual(['t5w3', 't6s1']);
});

test('it reads the marks of a session whose opening holds a brief sequence', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.session_opened',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 't4m2',
      payload: {
        model: 'claude-test-1',
        profile: 'default',
        kind: 'first',
        reason: null,
        lostSessionID: null,
        summarySequence: null,
        recentRecords: 0,
        recentEvents: 0,
        recalledThrough: 0,
        status: { start: 'first' },
        personaHash: 'sha256:persona',
        policyHash: 'sha256:policy',
        sessionKey: crypto.randomUUID(),
        briefSequence: 2,
      },
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 't4m2');

  expect(marks.hasOpening).toBeTrue();
});

test('it renders a brief record in the inbox with its text', async () => {
  const ctx = await setupTest();

  const [written] = await writeRecords(ctx.tasks.context.log, [
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

  invariant(written, 'the log wrote no record');

  const [entry] = await readRecords(ctx.tasks.context.log, {
    afterSequence: 0,
    sequences: [written.sequence],
  });

  invariant(entry, 'the log holds the brief record');

  expect(
    renderInboxMessage(
      entry.record,
      { defaultZone: 'UTC', now: new Date() },
      buildMockTaskMessageView(),
    ),
  ).toInclude('Find 3 quiet cafes near the station.');
});

test('it reads a definition task whose log holds its binding and a trigger fire', async () => {
  const ctx = await setupTest();

  const written = await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'w4t7r2n9ka',
      payload: { taskID: 'w4t7r2n9ka', isConversation: false, state: 'waiting' },
    },
    {
      kind: 'task.definition_set',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'w4t7r2n9ka',
      payload: {
        taskID: 'w4t7r2n9ka',
        definitionID: 'water-the-tomatoes',
        definitionHash: 'hash-1',
      },
    },
    {
      kind: 'trigger.fired',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'w4t7r2n9ka',
      payload: {
        definitionID: 'water-the-tomatoes',
        definitionHash: 'hash-1',
        source: 'schedule',
        dedupeKey: 'water-the-tomatoes:2027-03-11T21:00:00.000Z',
        kind: 'schedule',
        scheduledFor: '2027-03-11T21:00:00.000Z',
        firedAt: '2027-03-11T21:00:00.000Z',
        isCatchUp: false,
        skipped: [],
        skippedCount: 0,
      },
    },
  ]);

  const fire = written.at(2);

  invariant(fire, 'the log wrote no fire record');

  const [entry] = await readRecords(ctx.tasks.context.log, {
    afterSequence: 0,
    sequences: [fire.sequence],
  });

  invariant(entry, 'the log holds the fire record');

  const marks = await readSessionMarks(ctx.tasks.context, 'w4t7r2n9ka');
  const open = await readStartedTaskIDs(ctx.tasks.context, { end: 'open' });

  expect(marks.sessionKey).toBeNull();
  expect(open).toStrictEqual(['w4t7r2n9ka']);

  expect(
    renderInboxMessage(
      entry.record,
      { defaultZone: 'UTC', now: new Date() },
      buildMockTaskMessageView(),
    ),
  ).toInclude('trigger.fired');
});

test('it lists and reads a started task whose log holds task run records, a report shape and task run IDs on its calls', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:test' };

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task.created',
      definitions,
      thread: 't4m2',
      payload: {
        taskID: 't4m2',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
        startStep: 'conversation:1',
        options: {
          model: null,
          profile: null,
          persona: 'none',
          memory: 'none',
          tools: ['tasks.list', 'task.message', 'task.report'],
          report: 'wake',
          limits: { turns: 25, dollars: 2 },
          reportShape: {
            type: 'object',
            additionalProperties: false,
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
        briefMessageID: 'm7k2',
      },
      erasable: { name: 'Cafe scout' },
    },
    {
      kind: 'task.run_opened',
      definitions,
      thread: 't4m2',
      payload: {
        taskID: 't4m2',
        runID: 'a3f9c2d4-1111-4222-8333-444455556666',
        openedByStep: 't4m2:1',
        origin: { kind: 'start', sequence: null },
        definitionID: null,
        definitionHash: null,
        triggerKey: null,
        carriesRunID: null,
        briefID: null,
        report: { mode: 'wake', target: 'conversation' },
        reportShape: {
          type: 'object',
          additionalProperties: false,
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
        limits: { turns: 25, dollars: 2, calls: {} },
      },
    },
    {
      kind: 'tool_called',
      definitions,
      thread: 't4m2',
      payload: {
        callID: 'c9a1',
        runID: 't4m2',
        toolUseID: 'toolu_report',
        tool: 'task.report',
        taskRunID: 'a3f9c2d4-1111-4222-8333-444455556666',
      },
    },
    {
      kind: 'tool_result',
      definitions,
      thread: 't4m2',
      payload: {
        callID: 'c9a1',
        runID: 't4m2',
        toolUseID: 'toolu_report',
        outcome: 'result',
        actionID: null,
        sources: {},
        taskRunID: 'a3f9c2d4-1111-4222-8333-444455556666',
      },
    },
    {
      kind: 'task.failed_turn_spent',
      definitions,
      thread: 't4m2',
      payload: {
        taskID: 't4m2',
        dollars: 0.01,
        taskRunID: 'a3f9c2d4-1111-4222-8333-444455556666',
      },
    },
    {
      kind: 'task.run_report_requested',
      definitions,
      thread: 't4m2',
      payload: {
        taskID: 't4m2',
        runID: 'a3f9c2d4-1111-4222-8333-444455556666',
        stepKey: 't4m2:1',
        reportID: 'r8d2',
      },
      erasable: { summary: 'Found two cafes.', fields: { city: 'Lyon' } },
    },
    {
      kind: 'task.run_ended',
      definitions,
      thread: 't4m2',
      payload: {
        taskID: 't4m2',
        runID: 'a3f9c2d4-1111-4222-8333-444455556666',
        cause: 'reported',
        detail: {},
        endedBy: 'step:t4m2:1',
        definitionID: null,
        triggerKey: null,
        carriesRunID: null,
        used: { turns: 1, dollars: 0.01, calls: {} },
        reportID: 'r8d2',
        reportTo: 'conversation',
        delivery: 'wake',
      },
      erasable: { body: 'Found two cafes.' },
    },
  ]);

  const directory: readonly TaskProfile[] = [];

  const messaging = await readTaskDirectory(ctx.tasks.context, { directory });

  const entries = await readRecords(ctx.tasks.context.log, {
    afterSequence: 0,
    thread: 't4m2',
  });

  const calls = entries
    .filter((entry) => entry.record.kind === 'tool_called')
    .map((entry) => toolCalledCodec.decode(entry.record.payload).tool);

  const results = entries
    .filter((entry) => entry.record.kind === 'tool_result')
    .map((entry) => toolResultCodec.decode(entry.record.payload).outcome);

  expect(messaging.directory.map((profile) => profile.taskID)).toStrictEqual(['t4m2']);
  expect(entries).toHaveLength(7);
  expect(calls).toStrictEqual(['task.report']);
  expect(results).toStrictEqual(['result']);
});

test('it claims a started task with no report shape that waits on a message', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:test' };

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task.created',
      definitions,
      thread: 't6p4',
      payload: {
        taskID: 't6p4',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
        startStep: 'conversation:1',
        options: {
          model: null,
          profile: null,
          persona: 'none',
          memory: 'none',
          tools: ['tasks.list', 'task.message', 'task.report'],
          report: 'wake',
          limits: { turns: 25, dollars: 2 },
        },
      },
      erasable: { name: 'Tide tables' },
    },
    { kind: 'owner_message', definitions, thread: 't6p4' },
  ]);

  const claim = await claimTask(ctx.tasks.context, {
    holder: 'runner-a',
    leaseMs: 60_000,
    taskID: 't6p4',
  });

  expect(claim?.lease.workID).toBe('t6p4');
});

test('it raises the limit of a task that a limit end paused, and claims it again', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:test' };
  const runID = 'b5e1d3f7-2222-4333-8444-555566667777';

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task.created',
      definitions,
      thread: 't8q6',
      payload: {
        taskID: 't8q6',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
        startStep: 'conversation:1',
        options: {
          model: null,
          profile: null,
          persona: 'none',
          memory: 'none',
          tools: ['tasks.list', 'task.message', 'task.report'],
          report: 'next_turn',
          limits: { turns: 25, dollars: 2 },
        },
      },
      erasable: { name: 'Ferry times' },
    },
    { kind: 'owner_message', definitions, thread: 't8q6' },
    {
      kind: 'task.run_opened',
      definitions,
      thread: 't8q6',
      payload: {
        taskID: 't8q6',
        runID,
        openedByStep: 't8q6:1',
        origin: { kind: 'owner', sequence: 2 },
        definitionID: null,
        definitionHash: null,
        triggerKey: null,
        carriesRunID: null,
        briefID: null,
        report: { mode: 'next_turn', target: 'conversation' },
        reportShape: null,
        limits: { turns: 25, dollars: 2, calls: {} },
      },
    },
    {
      kind: 'task.paused',
      definitions,
      thread: 't8q6',
      payload: { taskID: 't8q6', resumeState: 'ready' },
    },
    {
      kind: 'task.limit_reached',
      definitions,
      thread: 't8q6',
      payload: {
        taskID: 't8q6',
        stepKey: 't8q6:1',
        used: { turns: 25, dollars: 0.4 },
        limits: { turns: 25, dollars: 2 },
      },
    },
    {
      kind: 'task.run_ended',
      definitions,
      thread: 't8q6',
      payload: {
        taskID: 't8q6',
        runID,
        cause: 'limit',
        detail: { meter: 'turns', used: 25, limit: 25 },
        endedBy: 'step:t8q6:1',
        definitionID: null,
        triggerKey: null,
        carriesRunID: null,
        used: { turns: 25, dollars: 0.4, calls: {} },
        reportID: 'r3k7',
        reportTo: 'conversation',
        delivery: 'next_turn',
      },
      erasable: { body: 'The run stopped at its 25 turns limit before it wrote a summary.' },
    },
    {
      kind: 'task.limit_notice',
      definitions,
      thread: 'conversation',
      payload: {
        taskID: 't8q6',
        used: { turns: 25, dollars: 0.4 },
        limits: { turns: 25, dollars: 2 },
      },
    },
  ]);

  const raise = await writeTaskLimitRaise(ctx.tasks.context, {
    taskID: 't8q6',
    limits: { turns: 40 },
  });

  const claim = await claimTask(ctx.tasks.context, {
    holder: 'runner-a',
    leaseMs: 60_000,
    taskID: 't8q6',
  });

  expect(raise).toStrictEqual({
    status: 'raised',
    state: 'ready',
    isPauseRequested: false,
    limits: { turns: 40, dollars: 2 },
    sandboxLimit: null,
  });

  expect(claim?.lease.workID).toBe('t8q6');
});

test('it lists a started task whose log holds a disposable mark, a change of the mark and a close by nixie', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:test' };

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task.created',
      definitions,
      thread: 't2n7',
      payload: {
        taskID: 't2n7',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
        startStep: 'conversation:1',
        options: {
          model: null,
          profile: null,
          persona: 'none',
          memory: 'none',
          tools: ['tasks.list', 'task.message', 'task.report'],
          report: 'wake',
          limits: { turns: 25, dollars: 2 },
        },
        briefMessageID: 'm3k8',
        disposable: true,
      },
      erasable: { name: 'Market prices' },
    },
    {
      kind: 'task.mark_set',
      definitions,
      thread: 't2n7',
      payload: { taskID: 't2n7', disposable: false },
    },
    {
      kind: 'task.closed',
      definitions,
      thread: 't2n7',
      payload: { taskID: 't2n7', stepKey: null, timerIDs: [], closedBy: 'nixie' },
    },
  ]);

  const directory: readonly TaskProfile[] = [];

  const messaging = await readTaskDirectory(ctx.tasks.context, { directory });
  const ended = await readStartedTaskIDs(ctx.tasks.context, { end: 'ended' });

  expect(messaging.directory.map((profile) => profile.taskID)).toStrictEqual(['t2n7']);
  expect(ended).toStrictEqual(['t2n7']);
});

test('it lists a started task whose creation record holds the conversation log option', async () => {
  const ctx = await setupTest();

  const [created] = await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 't8p6',
      payload: {
        taskID: 't8p6',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
        startStep: 'conversation:1',
        options: {
          model: null,
          profile: null,
          persona: 'default',
          memory: 'read',
          log: 'conversation',
          tools: [],
          report: 'wake',
          limits: { turns: 25, dollars: 2 },
        },
        briefMessageID: 'm5r1',
      },
      erasable: { name: 'Note taker' },
    },
  ]);

  invariant(created);

  const directory: readonly TaskProfile[] = [];

  const messaging = await readTaskDirectory(ctx.tasks.context, { directory });

  expect(taskCreatedCodec.tryDecodePartial(created.payload)?.taskID).toBe('t8p6');
  expect(messaging.directory.map((profile) => profile.taskID)).toStrictEqual(['t8p6']);
});

test('it reads past the worker records that a newer release wrote on a thread', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:test' };

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'worker.run_started',
      definitions,
      thread: 'conversation',
      payload: {
        workerRunID: crypto.randomUUID(),
        shortID: 'w3k8',
        callID: crypto.randomUUID(),
        stepRunID: 'step-a',
        model: 'claude-test-1',
        profile: 'worker',
        tools: [],
        limits: { minutes: 10, turns: 25, tokens: 2_000_000, dollars: 2 },
        isTaskLimit: false,
      },
    },
    {
      kind: 'worker.turn_ended',
      definitions,
      thread: 'conversation',
      payload: { workerRunID: crypto.randomUUID(), turn: 1, dollars: 0.01 },
      erasable: { text: 'Found 3 cafes.' },
    },
  ]);

  const started = await readStartedTaskIDs(ctx.tasks.context, { end: 'open' });
  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect({ started, hasOpening: marks.hasOpening }).toStrictEqual({
    started: [],
    hasOpening: false,
  });
});
