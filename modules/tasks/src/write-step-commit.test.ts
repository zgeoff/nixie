import { expect, onTestFinished, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { setFaultPointHandler } from './set-fault-point-handler';
import { StepAlreadyCommittedError } from './step-already-committed-error';
import { createTestClaim } from './test-utils/create-test-claim';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { FaultPointID, TasksTables } from './types';
import { writeInboxRecords } from './write-inbox-records';
import { writeStepCommit } from './write-step-commit';
import { writeTaskControl } from './write-task-control';

async function setupTest() {
  const tasks = await startTestTasks();

  const db = tasks.writer.db.$extendTables<
    TasksTables & Readonly<{ records: { readonly step_key: string | null } }>
  >();

  return { ...tasks, db };
}

test('it moves a task that waits with nothing unread to waiting', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [] });

  const task = await ctx.db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  expect(task).toMatchObject({
    state: 'waiting',
    committed_steps: 1,
    started_step_key: null,
  });
});

test('it moves a task with more to do back to ready', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepCommit(ctx.context, claim, { next: 'continue', records: [], acknowledged: [] });

  const task = await ctx.db.selectFrom('tasks').select('state').executeTakeFirstOrThrow();

  expect(task.state).toBe('ready');
});

test('it moves a finished task to done', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepCommit(ctx.context, claim, { next: 'done', records: [], acknowledged: [] });

  const task = await ctx.db.selectFrom('tasks').select('state').executeTakeFirstOrThrow();

  expect(task.state).toBe('done');
});

test('it keeps a task ready when input it did not read is still in its inbox', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  const [message] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: claim.lease.workID,
      contentSource: 'owner',
      erasable: { text: 'one more thing' },
    },
  ]);

  invariant(message);

  await writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [] });

  const task = await ctx.db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  expect(task).toMatchObject({
    state: 'ready',
    read_cursor: 0,
    last_inbox_sequence: message.sequence,
  });
});

test('it moves a task that holds its inbox to waiting with its input still unread', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  const [message] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: claim.lease.workID,
      contentSource: 'owner',
      erasable: { text: 'one more thing' },
    },
  ]);

  invariant(message);

  await writeStepCommit(ctx.context, claim, { next: 'hold', records: [], acknowledged: [] });

  const task = await ctx.db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  expect(task).toMatchObject({
    state: 'waiting',
    read_cursor: 0,
    last_inbox_sequence: message.sequence,
  });
});

test('it moves the read cursor over the contiguous run of acknowledged inbox records', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  const [first, , third] = await writeInboxRecords(
    ctx.context,
    ['first', 'second', 'third'].map((text) => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: claim.lease.workID,
      erasable: { text },
    })),
  );

  invariant(first && third);

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [first.sequence, third.sequence],
  });

  const task = await ctx.db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  expect(task).toMatchObject({ state: 'ready', read_cursor: first.sequence });
});

test('it writes the step records and the commit record with its step key', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [
      {
        kind: 'turn_finished',
        definitions: { snapshotHash: 'sha256:test' },
        payload: { turns: 1 },
      },
    ],
    acknowledged: [],
  });

  const records = await ctx.db
    .selectFrom('records')
    .select(['kind', 'thread', 'step_key'])
    .where('sequence', '>', 2)
    .execute();

  expect(records).toStrictEqual([
    { kind: 'turn_finished', thread: claim.lease.workID, step_key: null },
    {
      kind: 'task.step_committed',
      thread: claim.lease.workID,
      step_key: `${claim.lease.workID}:1`,
    },
  ]);
});

test('it keeps the session boundary the step returned', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    sessionBoundary: 'entry-42',
  });

  const task = await ctx.db
    .selectFrom('tasks')
    .select('session_boundary')
    .executeTakeFirstOrThrow();

  expect(task.session_boundary).toBe('entry-42');
});

test('it sets each timer the step asked for', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 2_000_000 }],
  });

  const timers = await ctx.db.selectFrom('timers').selectAll().execute();

  expect(timers).toStrictEqual([
    {
      timer_id: expect.toBeString(),
      task_id: claim.lease.workID,
      due_at: 2_000_000,
      set_sequence: 3,
      fired_at: null,
      fired_sequence: null,
      withdrawn_sequence: null,
    },
  ]);
});

test('it frees the lease once the step commits', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [] });

  const lease = await ctx.db.selectFrom('leases').selectAll().executeTakeFirstOrThrow();

  expect(lease).toMatchObject({ holder: null, expires_at: null, generation: 1 });
});

test('it commits a step key once, and a second commit changes nothing', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepCommit(ctx.context, claim, { next: 'continue', records: [], acknowledged: [] });

  const rerun = await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  invariant(rerun);

  const second = writeStepCommit(
    ctx.context,
    { ...rerun, stepKey: claim.stepKey },
    { next: 'done', records: [], acknowledged: [] },
  );

  await second.catch(() => {});

  const commits = await ctx.db
    .selectFrom('records')
    .select('step_key')
    .where('kind', '=', 'task.step_committed')
    .execute();

  expect(second).rejects.toThrowWithMessage(
    StepAlreadyCommittedError,
    `step ${claim.stepKey} has already committed`,
  );

  expect(commits).toStrictEqual([{ step_key: claim.stepKey }]);
});

test('it commits nothing once the lease expired', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  ctx.clock.advance(60_000);

  const commit = writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
  });

  await commit.catch(() => {});

  const task = await ctx.db.selectFrom('tasks').select('state').executeTakeFirstOrThrow();

  expect(commit).rejects.toMatchObject({ name: 'LeaseLostError' });
  expect(task.state).toBe('running');
});

test('it commits nothing once another runner claimed the task', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  ctx.clock.advance(60_000);

  await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  const commit = writeStepCommit(ctx.context, claim, {
    next: 'done',
    records: [],
    acknowledged: [],
  });

  await commit.catch(() => {});

  const task = await ctx.db.selectFrom('tasks').select('committed_steps').executeTakeFirstOrThrow();

  expect(commit).rejects.toMatchObject({ name: 'LeaseLostError' });
  expect(task.committed_steps).toBe(0);
});

test('it refuses a step record that carries a step key', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  const commit = writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [
      { kind: 'turn_finished', definitions: { snapshotHash: 'sha256:test' }, stepKey: 'x:1' },
    ],
    acknowledged: [],
  });

  await commit.catch(() => {});

  expect(commit).rejects.toThrowWithMessage(
    Error,
    "a step's turn_finished record carries a step key; only its commit does",
  );
});

test('it refuses a timer that is due at no time', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  const commit = writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: Number.NaN }],
  });

  await commit.catch(() => {});

  const task = await ctx.db.selectFrom('tasks').select('committed_steps').executeTakeFirstOrThrow();

  expect(commit).rejects.toThrowWithMessage(
    Error,
    "a step's timer is due at NaN, which is no time",
  );

  expect(task.committed_steps).toBe(0);
});

test('it reaches step.commit.before and step.commit.after around the commit', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  const reached: FaultPointID[] = [];

  setFaultPointHandler((id) => {
    reached.push(id);
  });

  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  await writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [] });

  expect(reached).toStrictEqual(['step.commit.before', 'step.commit.after']);
});

test('it pauses a task whose pause waited on the step, to resume where the step left it', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeTaskControl(ctx.context, { taskID: claim.lease.workID, control: 'pause' });
  await writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [] });

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'pause_requested', 'resume_state', 'committed_steps'])
    .executeTakeFirstOrThrow();

  expect(task).toStrictEqual({
    state: 'paused',
    pause_requested: 0,
    resume_state: 'waiting',
    committed_steps: 1,
  });
});

test('it lets a task whose pause waited on its last step finish as done', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeTaskControl(ctx.context, { taskID: claim.lease.workID, control: 'pause' });
  await writeStepCommit(ctx.context, claim, { next: 'done', records: [], acknowledged: [] });

  const task = await ctx.db.selectFrom('tasks').select('state').executeTakeFirstOrThrow();

  expect(task.state).toBe('done');
});
