// oxlint-disable zgeoff/test-beside-module -- it tests the readers of several modules, not one
import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { modelSessionOpenedCodec } from '@heynixie/models';
import type { TaskProfile } from '@heynixie/tasks';
import { readTaskDirectory, taskCreatedCodec } from '@heynixie/tasks';
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
        origin: { kind: 'brief', sequence: null },
        definitionID: null,
        definitionHash: null,
        triggerKey: null,
        carriesRunID: null,
        briefID: null,
        report: { mode: 'wake', target: 'conversation' },
        reportShape: null,
        limits: { turns: 25, dollars: 2, calls: {} },
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

  expect(messaging.directory.map((profile) => profile.taskID)).toStrictEqual(['t4m2']);
  expect(entries).toHaveLength(5);
});
