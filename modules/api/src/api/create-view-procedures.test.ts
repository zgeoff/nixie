import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContractClient } from '@heynixie/contract';
import { skipReasonSchema } from '@heynixie/contract';
import { createPathSource, readListedDefinitions, runSeed } from '@heynixie/definitions';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import type { RecordInput } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import {
  skipReasons,
  taskRunEndedCodec,
  taskRunOpenedCodec,
  triggerSkippedCodec,
} from '@heynixie/tasks';
import { writeTestTriggerFire } from '@heynixie/tasks/test-utils';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

interface PinnedDefinition {
  readonly id: string;
  readonly hash: string;
}

async function setupTest() {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');
  const directory = await mkdtemp(join(tmpdir(), 'nixie-view-definitions-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(root);
  await writeFile(join(root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  const source = createPathSource({ directory: root });
  const definitions = api.context.definitions();

  const buildEndedRunRecords = (
    taskID: string,
    runID: string,
    definition: PinnedDefinition | undefined,
  ): RecordInput[] => [
    {
      kind: 'task.run_opened',
      definitions,
      thread: taskID,
      payload: taskRunOpenedCodec.encode({
        taskID,
        runID,
        openedByStep: `${taskID}:1`,
        origin: { kind: 'brief', sequence: null },
        definitionID: definition?.id ?? null,
        definitionHash: definition?.hash ?? null,
        triggerKey: null,
        carriesRunID: null,
        briefID: null,
        report: { mode: 'wake', target: 'conversation' },
        reportShape: null,
        limits: { turns: 25, dollars: 2, calls: {} },
      }),
    },
    {
      kind: 'task.run_ended',
      definitions,
      thread: taskID,
      payload: taskRunEndedCodec.encode({
        taskID,
        runID,
        cause: 'reported',
        detail: {},
        endedBy: `step:${taskID}:1`,
        definitionID: definition?.id ?? null,
        triggerKey: null,
        carriesRunID: null,
        used: { turns: 3, dollars: 0.5, calls: { 'web.fetch': 2 } },
        reportID: `report-${runID}`,
        reportTo: 'conversation',
        delivery: 'wake',
      }),
      erasable: { body: 'Done.' },
    },
  ];

  return {
    ...api,
    client: buildTestClient(api.url, laptop.token),
    stranger: buildTestClient(api.url),
    writeDefinition: async (id: string, yaml: string) => {
      await mkdir(join(root, 'tasks', id), { recursive: true });
      await writeFile(join(root, 'tasks', id, 'task.yaml'), yaml);
    },
    removeDefinition: (id: string) => rm(join(root, 'tasks', id), { recursive: true }),
    runSeed: async () => {
      const result = await runSeed({
        tasks: buildTestTaskSeed(),
        log: api.context.log,
        source,
        buildPolicy: () => ({ rules: [], tools: [] }),
      });

      if (result.status !== 'seeded') {
        throw new Error(`the seed ended ${result.status}`);
      }

      return result.record.sequence;
    },
    readDefinitions: () => readListedDefinitions(api.writer.db),
    writeEndedRuns: (taskID: string, count: number, definition?: PinnedDefinition) =>
      writeRecords(
        api.context.log,
        Array.from({ length: count }, (_unused, index) =>
          buildEndedRunRecords(taskID, `${definition?.id ?? 'run'}-${index}`, definition),
        ).flat(),
      ),
    writeTask: (taskID: string) =>
      writeRecords(api.context.log, [
        {
          kind: 'task.created',
          definitions: { snapshotHash: 'sha256:test' },
          thread: taskID,
          payload: { taskID, isConversation: false, state: 'waiting', startedBy: 'conversation' },
          erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
        },
      ]),
  };
}

test('#tasks.listEnded pages through 101 ended task runs newest first, and ends with a null next', async () => {
  const ctx = await setupTest();

  await ctx.writeTask('k3x9m2p7qa');
  await ctx.writeEndedRuns('k3x9m2p7qa', 101);

  const first = await ctx.client.tasks.listEnded({ limit: 100 });
  const second = await ctx.client.tasks.listEnded({ limit: 100, before: first.next ?? 0 });

  expect(first.runs).toHaveLength(100);
  expect(first.runs[0]?.runID).toBe('run-100');
  expect(first.runs[99]?.runID).toBe('run-1');
  expect(first.next).toBe(first.runs[99]?.sequence ?? -1);
  expect(second.runs.map((run) => run.runID)).toStrictEqual(['run-0']);
  expect(second.next).toBeNull();
});

test('#tasks.listEnded gives each run its fields and one task for its page', async () => {
  const ctx = await setupTest();

  await ctx.writeTask('k3x9m2p7qa');
  await ctx.writeEndedRuns('k3x9m2p7qa', 2);

  const listed = await ctx.client.tasks.listEnded({ limit: 10 });

  expect(listed.runs[0]).toStrictEqual({
    runID: 'run-1',
    taskID: 'k3x9m2p7qa',
    definitionID: null,
    startedAt: expect.toBeValidDate(),
    endedAt: expect.toBeValidDate(),
    sequence: expect.toBeNumber(),
    cause: 'reported',
    endedBy: 'step:k3x9m2p7qa:1',
    carriesRunID: null,
    reportID: 'report-run-1',
    delivery: 'wake',
    used: { turns: 3, dollars: 0.5 },
  });

  expect(listed.tasks.map((task) => task.taskID)).toStrictEqual(['k3x9m2p7qa']);
  expect(listed.tasks[0]?.name).toBe('Garden plan');
});

test('#tasks.listEnded keeps only the runs of the definition that the query names', async () => {
  const ctx = await setupTest();

  await ctx.writeTask('k3x9m2p7qa');
  await ctx.writeEndedRuns('k3x9m2p7qa', 1, { id: 'water-the-tomatoes', hash: 'hash-1' });
  await ctx.writeEndedRuns('k3x9m2p7qa', 1);

  const listed = await ctx.client.tasks.listEnded({
    limit: 10,
    definitionID: 'water-the-tomatoes',
  });

  expect(listed.runs.map((run) => run.definitionID)).toStrictEqual(['water-the-tomatoes']);
});

test('#tasks.listEnded lists a task whose definition left force, under the name of the version its run pinned', async () => {
  const ctx = await setupTest();

  await ctx.writeDefinition(
    'water-the-tomatoes',
    'name: Water the tomatoes\nbrief: Water the beds.\n',
  );

  await ctx.runSeed();

  const [definition] = await ctx.readDefinitions();
  const defined = await ctx.client.definitions.listTasks({});

  const taskID = defined.definitions[0]?.taskID;

  if (definition === undefined || taskID === undefined || taskID === null) {
    throw new Error('the seed bound no task');
  }

  await ctx.writeEndedRuns(taskID, 1, {
    id: 'water-the-tomatoes',
    hash: definition.definitionHash,
  });

  await ctx.removeDefinition('water-the-tomatoes');
  await ctx.runSeed();

  const listed = await ctx.client.tasks.listEnded({ limit: 10 });

  expect(listed.tasks.map((task) => [task.taskID, task.name, task.brief])).toStrictEqual([
    [taskID, 'Water the tomatoes', 'Water the beds.'],
  ]);
});

test('#triggers.report holds a skipped fire and a late catch-up from the date, and leaves out an on-time fire and an earlier entry', async () => {
  const ctx = await setupTest();

  await ctx.writeDefinition(
    'water-the-tomatoes',
    'name: Water the tomatoes\nbrief: Water the beds.\n',
  );

  await ctx.runSeed();

  const [definition] = await ctx.readDefinitions();
  const defined = await ctx.client.definitions.listTasks({});

  const taskID = defined.definitions[0]?.taskID;

  if (definition === undefined || taskID === undefined || taskID === null) {
    throw new Error('the seed bound no task');
  }

  const hash = definition.definitionHash;

  await writeTestTriggerFire(ctx.context, taskID, {
    definitionHash: hash,
    dedupeKey: 'water-the-tomatoes|2027-02-27T21:00:00.000Z',
    scheduledFor: '2027-02-27T21:00:00.000Z',
    firedAt: '2027-02-28T09:00:00.000Z',
    isCatchUp: true,
  });

  const [skipped] = await writeRecords(ctx.context.log, [
    {
      kind: 'trigger.skipped',
      definitions: ctx.context.definitions(),
      thread: taskID,
      payload: triggerSkippedCodec.encode({
        definitionID: 'water-the-tomatoes',
        source: 'schedule',
        dedupeKey: 'water-the-tomatoes|2027-03-10T21:00:00.000Z',
        scheduledFor: ['2027-03-09T21:00:00.000Z', '2027-03-10T21:00:00.000Z'],
        count: 2,
        reason: 'task_held',
        recordedAt: '2027-03-11T09:00:00.000Z',
      }),
    },
  ]);

  await writeTestTriggerFire(ctx.context, taskID, {
    definitionHash: hash,
    dedupeKey: 'water-the-tomatoes|2027-03-11T08:00:00.000Z',
    scheduledFor: '2027-03-11T08:00:00.000Z',
    firedAt: '2027-03-11T08:00:00.000Z',
    isCatchUp: false,
  });

  const late = await writeTestTriggerFire(ctx.context, taskID, {
    definitionHash: hash,
    dedupeKey: 'water-the-tomatoes|2027-03-11T21:00:00.000Z',
    scheduledFor: '2027-03-11T21:00:00.000Z',
    firedAt: '2027-03-12T00:00:00.000Z',
    isCatchUp: true,
  });

  const report = await ctx.client.triggers.report({ since: '2027-03-01' });

  expect(report.entries).toStrictEqual([
    {
      definitionID: 'water-the-tomatoes',
      name: 'Water the tomatoes',
      kind: 'late',
      scheduledFor: '2027-03-11T21:00:00.000Z',
      firedAt: '2027-03-12T00:00:00.000Z',
      lateBySeconds: 10_800,
      reason: null,
      sequence: late,
    },
    {
      definitionID: 'water-the-tomatoes',
      name: 'Water the tomatoes',
      kind: 'skipped',
      scheduledFor: '2027-03-10T21:00:00.000Z',
      firedAt: null,
      lateBySeconds: null,
      reason: 'task_held',
      sequence: skipped?.sequence ?? -1,
    },
  ]);
});

test('#triggers.report names a skip by the definition in force, and by its ID when none is stored', async () => {
  const ctx = await setupTest();

  await ctx.writeDefinition(
    'prune-the-roses',
    'name: Prune the roses\nbrief: Cut the dead wood.\n',
  );

  await ctx.runSeed();

  await writeRecords(
    ctx.context.log,
    ['prune-the-roses', 'mow-the-lawn'].map((definitionID): RecordInput => ({
      kind: 'trigger.skipped',
      definitions: ctx.context.definitions(),
      payload: triggerSkippedCodec.encode({
        definitionID,
        source: 'schedule',
        dedupeKey: `${definitionID}|2027-03-10T21:00:00.000Z`,
        scheduledFor: ['2027-03-10T21:00:00.000Z'],
        count: 1,
        reason: 'too_late',
        recordedAt: '2027-03-11T09:00:00.000Z',
      }),
    })),
  );

  const report = await ctx.client.triggers.report({ since: '2027-03-01' });

  expect(report.entries.map((entry) => [entry.definitionID, entry.name])).toStrictEqual([
    ['mow-the-lawn', 'mow-the-lawn'],
    ['prune-the-roses', 'Prune the roses'],
  ]);
});

test('#definitions.listTasks holds a spent one-shot with a null next, and a conversation definition with a null task', async () => {
  const ctx = await setupTest();

  await ctx.writeDefinition(
    'dentist',
    'name: Call the dentist\nbrief: Book the check-up.\ntrigger:\n  at: "2027-03-09T14:00:00+11:00"\n',
  );

  await ctx.writeDefinition(
    'call-the-vet',
    'name: Call the vet\nbrief: Book the check-up.\ntarget: conversation\ntrigger:\n  at: "2099-03-09T14:00:00Z"\n',
  );

  const seeded = await ctx.runSeed();
  const before = await ctx.client.definitions.listTasks({});

  const dentistTask = before.definitions.find((entry) => entry.definitionID === 'dentist')?.taskID;

  const stored = await ctx.readDefinitions();

  const dentist = stored.find((entry) => entry.definitionID === 'dentist');

  if (dentistTask === undefined || dentistTask === null || dentist === undefined) {
    throw new Error('the seed bound no task');
  }

  await writeTestTriggerFire(ctx.context, dentistTask, {
    definitionID: 'dentist',
    definitionHash: dentist.definitionHash,
    kind: 'at',
    dedupeKey: 'dentist|2027-03-09T03:00:00.000Z',
    scheduledFor: '2027-03-09T03:00:00.000Z',
    firedAt: '2027-03-09T03:00:00.000Z',
  });

  const listed = await ctx.client.definitions.listTasks({});

  expect(listed.definitions).toStrictEqual([
    {
      definitionID: 'call-the-vet',
      name: 'Call the vet',
      enabled: true,
      target: 'conversation',
      trigger: { at: '2099-03-09T14:00:00Z' },
      rendered: 'once on Mon 9 Mar at 14:00',
      next: 'Mon 9 Mar',
      tools: [],
      origin: 'definitions',
      createdBy: { sequence: seeded, kind: 'definitions_seeded' },
      taskID: null,
      isUnreadable: false,
    },
    {
      definitionID: 'dentist',
      name: 'Call the dentist',
      enabled: true,
      target: 'task',
      trigger: { at: '2027-03-09T14:00:00+11:00' },
      rendered: 'once on Tue 9 Mar at 03:00',
      next: null,
      tools: expect.toBeArray(),
      origin: 'definitions',
      createdBy: { sequence: seeded, kind: 'definitions_seeded' },
      taskID: dentistTask,
      isUnreadable: false,
    },
  ]);
});

test('#definitions.listTasks gives the next fire of a definition whose trigger is armed', async () => {
  const ctx = await setupTest();

  await ctx.writeDefinition(
    'water-the-tomatoes',
    'name: Water the tomatoes\nbrief: Water the beds.\ntrigger:\n  schedule:\n    every: day\n    at: "08:00"\n    zone: UTC\n',
  );

  await ctx.runSeed();

  const listed = await ctx.client.definitions.listTasks({});

  expect(listed.definitions[0]).toMatchObject({
    rendered: 'every day at 08:00',
    next: expect.toBeString(),
  });
});

test.each([
  {
    procedure: 'tasks.listEnded',
    call: (client: ContractClient) => client.tasks.listEnded({ limit: 10 }),
  },
  {
    procedure: 'triggers.report',
    call: (client: ContractClient) => client.triggers.report({ since: '2027-03-01' }),
  },
  {
    procedure: 'definitions.listTasks',
    call: (client: ContractClient) => client.definitions.listTasks({}),
  },
])('it refuses a caller with no session on $procedure', async (row) => {
  const ctx = await setupTest();

  expect(row.call(ctx.stranger)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('it keeps the skip reasons of the contract equal to those the tasks module records', () => {
  expect(skipReasonSchema.options).toStrictEqual([...skipReasons]);
});
