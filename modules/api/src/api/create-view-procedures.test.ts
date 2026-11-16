import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContractClient } from '@heynixie/contract';
import { skipReasonSchema } from '@heynixie/contract';
import { createPathSource, readListedDefinitions, runSeed } from '@heynixie/definitions';
import { buildTestTaskSeed, seedTaskVersions } from '@heynixie/definitions/test-utils';
import { claimTask, skipReasons, writeStepCommit } from '@heynixie/tasks';
import {
  buildTaskSeeder,
  seedDefinitionTask,
  seedWithdrawnPendingTasks,
  writeTestTriggerFire,
  writeTestTriggerSkip,
} from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

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

  return {
    ...api,
    seed: buildTaskSeeder({ context: api.context }),
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
  };
}

test('#tasks.listEnded pages through ended task runs newest first, and ends with a null next', async () => {
  const ctx = await setupTest();
  const step = await ctx.seed.conversationStep();
  const first = await ctx.seed.doneTask({ starter: step.claim, name: 'First', brief: 'One.' });
  const second = await ctx.seed.doneTask({ starter: step.claim, name: 'Second', brief: 'Two.' });
  const third = await ctx.seed.doneTask({ starter: step.claim, name: 'Third', brief: 'Three.' });
  const newest = await ctx.client.tasks.listEnded({ limit: 2 });
  const oldest = await ctx.client.tasks.listEnded({ limit: 2, before: newest.next ?? 0 });

  expect(newest.runs.map((run) => run.taskID)).toStrictEqual([third, second]);
  expect(newest.next).toBe(newest.runs[1]?.sequence ?? -1);
  expect(oldest.runs.map((run) => run.taskID)).toStrictEqual([first]);
  expect(oldest.next).toBeNull();
});

test('#tasks.listEnded gives each run its fields and one task for its page', async () => {
  const ctx = await setupTest();
  const step = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.doneTask({
    starter: step.claim,
    name: 'Garden plan',
    brief: 'Plan the beds.',
  });

  const listed = await ctx.client.tasks.listEnded({ limit: 10 });

  expect(listed.runs).toStrictEqual([
    {
      runID: expect.toBeString(),
      taskID,
      definitionID: null,
      startedAt: expect.toBeValidDate(),
      endedAt: expect.toBeValidDate(),
      sequence: expect.toBeNumber(),
      cause: 'no_report',
      endedBy: expect.toBeString(),
      carriesRunID: null,
      reportID: expect.toBeString(),
      delivery: expect.toBeString(),
      fire: null,
      used: { turns: expect.toBeNumber(), dollars: expect.toBeNumber() },
    },
  ]);

  expect(listed.tasks.map((task) => [task.taskID, task.name])).toStrictEqual([
    [taskID, 'Garden plan'],
  ]);
});

test('#tasks.listEnded keeps only the runs of the definition that the query names', async () => {
  const ctx = await setupTest();
  const step = await ctx.seed.conversationStep();

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

  ctx.definitionStore.add(definition.definitionHash, {});

  await ctx.seed.endedDefinitionRun({
    taskID,
    definitionID: 'water-the-tomatoes',
    definitionHash: definition.definitionHash,
  });

  await ctx.seed.doneTask({ starter: step.claim, name: 'Garden plan', brief: 'Plan the beds.' });

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

  ctx.definitionStore.add(definition.definitionHash, {});

  await ctx.seed.endedDefinitionRun({
    taskID,
    definitionID: 'water-the-tomatoes',
    definitionHash: definition.definitionHash,
  });

  await ctx.removeDefinition('water-the-tomatoes');
  await ctx.runSeed();

  const listed = await ctx.client.tasks.listEnded({ limit: 10 });

  expect(listed.tasks.map((task) => [task.taskID, task.name, task.brief])).toStrictEqual([
    [taskID, 'Water the tomatoes', 'Water the beds.'],
  ]);
});

test('#tasks.listEnded names a withdrawn task as tasks.read does, by the version of its open run and not its ended one', async () => {
  const ctx = await setupTest();

  await ctx.writeDefinition(
    'water-the-tomatoes',
    'name: Water the tomatoes\nbrief: Water the beds.\n',
  );

  await ctx.runSeed();

  const [first] = await ctx.readDefinitions();
  const defined = await ctx.client.definitions.listTasks({});

  const taskID = defined.definitions[0]?.taskID;

  if (first === undefined || taskID === undefined || taskID === null) {
    throw new Error('the seed bound no task');
  }

  ctx.definitionStore.add(first.definitionHash, {});

  await ctx.seed.endedDefinitionRun({
    taskID,
    definitionID: 'water-the-tomatoes',
    definitionHash: first.definitionHash,
  });

  await ctx.writeDefinition(
    'water-the-tomatoes',
    'name: Water the seedlings\nbrief: Water the seed trays.\n',
  );

  await ctx.runSeed();

  const [second] = await ctx.readDefinitions();

  if (second === undefined) {
    throw new Error('the seed stored no second version');
  }

  ctx.definitionStore.add(second.definitionHash, {});

  await ctx.seed.openDefinitionRun({
    taskID,
    definitionID: 'water-the-tomatoes',
    definitionHash: second.definitionHash,
  });

  await ctx.removeDefinition('water-the-tomatoes');
  await ctx.runSeed();

  const listed = await ctx.client.tasks.listEnded({ limit: 10 });
  const read = await ctx.client.tasks.read({ taskID });

  expect(listed.tasks.map((task) => [task.name, task.brief])).toStrictEqual([
    ['Water the seedlings', 'Water the seed trays.'],
  ]);

  expect([read.name, read.brief]).toStrictEqual(['Water the seedlings', 'Water the seed trays.']);
});

test(
  '#tasks.listEnded gives the profile of its one task when 1,001 newer withdrawn tasks have pending runs',
  async () => {
    const ctx = await setupTest();

    await ctx.writeDefinition(
      'water-the-tomatoes',
      'name: Water the tomatoes\nbrief: Water the beds.\n',
    );

    await ctx.runSeed();

    const [tomatoes] = await ctx.readDefinitions();
    const defined = await ctx.client.definitions.listTasks({});

    const tomatoesTask = defined.definitions[0]?.taskID;

    invariant(tomatoes);
    invariant(typeof tomatoesTask === 'string');

    ctx.definitionStore.add(tomatoes.definitionHash, {});

    await ctx.seed.endedDefinitionRun({
      taskID: tomatoesTask,
      definitionID: 'water-the-tomatoes',
      definitionHash: tomatoes.definitionHash,
    });

    await ctx.removeDefinition('water-the-tomatoes');
    await ctx.runSeed();

    const crowd = await seedTaskVersions(
      ctx.writer,
      Array.from({ length: 1001 }, (_, index) => ({
        definitionID: `prune-the-roses-${index}`,
        name: `Prune the roses ${index}`,
        brief: 'Cut the old wood.',
      })),
    );

    await seedWithdrawnPendingTasks(ctx.context, crowd);

    const listed = await ctx.client.tasks.listEnded({ limit: 1 });

    expect(listed.tasks).toStrictEqual([
      {
        actions: { cancelled: 0, queued: 0, started: 0 },
        brief: 'Water the beds.',
        controls: ['pause', 'resume', 'stop', 'restart', 'close', 'interrupt'],
        definitionID: 'water-the-tomatoes',
        disposable: null,
        fire: {
          scheduledFor: '2027-03-11T21:00:00.000Z',
          firedAt: '2027-03-11T21:00:00.000Z',
          isCatchUp: false,
        },
        isPauseRequested: false,
        isPausedByNixie: false,
        isTakingMessages: false,
        lastActivityAt: expect.toBeValidDate(),
        listedState: 'ready',
        name: 'Water the tomatoes',
        runner: 'sandbox',
        state: 'ready',
        taskID: tomatoesTask,
        wakeable: false,
      },
    ]);
  },
  // oxlint-disable-next-line zgeoff/max-test-timeout -- 9 s locally; floor: 1,001 tasks write 4 log records each at about 1.5 ms a record
  { timeout: 15_000 },
);

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

  const skipped = await writeTestTriggerSkip(ctx.context, taskID, {
    definitionID: 'water-the-tomatoes',
    dedupeKey: 'water-the-tomatoes|2027-03-10T21:00:00.000Z',
    scheduledFor: ['2027-03-09T21:00:00.000Z', '2027-03-10T21:00:00.000Z'],
    count: 2,
    reason: 'task_held',
  });

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
      sequence: skipped,
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

  const defined = await ctx.client.definitions.listTasks({});

  const taskID = defined.definitions[0]?.taskID;

  if (taskID === undefined || taskID === null) {
    throw new Error('the seed bound no task');
  }

  await writeTestTriggerSkip(ctx.context, taskID, { definitionID: 'prune-the-roses' });
  await writeTestTriggerSkip(ctx.context, taskID, { definitionID: 'mow-the-lawn' });

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

test('#tasks.listEnded gives a trigger task run its fire, and a task run that no fire opened none', async () => {
  const ctx = await setupTest();
  const step = await ctx.seed.conversationStep();

  await ctx.seed.doneTask({ starter: step.claim, name: 'Garden plan', brief: 'Plan the beds.' });

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await writeTestTriggerFire(ctx.context, taskID, {
    definitionHash: 'hash-1',
    scheduledFor: '2027-03-11T21:00:00.000Z',
    firedAt: '2027-03-11T21:20:00.000Z',
    isCatchUp: true,
  });

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  invariant(claim, 'the fire is ready to claim');

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'Done.' } },
  });

  const listed = await ctx.client.tasks.listEnded({ limit: 10 });

  expect(listed.runs.map((run) => run.fire)).toStrictEqual([
    {
      scheduledFor: '2027-03-11T21:00:00.000Z',
      firedAt: '2027-03-11T21:20:00.000Z',
      isCatchUp: true,
    },
    null,
  ]);
});
