import { expect, onTestFinished, test } from 'bun:test';
import { claimTask } from './claim-task';
import { createTask } from './create-task';
import { LeaseLostError } from './lease-lost-error';
import { setFaultPointHandler } from './set-fault-point-handler';
import { StepAlreadyCommittedError } from './step-already-committed-error';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { FaultPointID, TasksTables } from './types';
import { writeInboxRecords } from './write-inbox-records';
import { writeStepCommit } from './write-step-commit';

async function setupTest() {
  const tasks = await startTestTasks();

  // the step key column of the log's records, which the tasks tables leave out
  const db = tasks.writer.db.$extendTables<
    TasksTables & Readonly<{ records: { readonly step_key: string | null } }>
  >();
  const taskID = await createTask(tasks.context, 'tidy the inbox');
  const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null) {
    throw new Error('the setup claim found no task');
  }
  const readTask = () => db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  return { ...tasks, db, taskID, claim, readTask };
}

test('it moves a task that waits with nothing unread to waiting', async () => {
  const ctx = await setupTest();

  await writeStepCommit(ctx.context, ctx.claim, { next: 'wait', records: [], acknowledged: [] });

  const task = await ctx.readTask();

  expect(task).toMatchObject({
    state: 'waiting',
    committed_steps: 1,
    started_step_key: null,
  });
});

test('it moves a task with more to do back to ready', async () => {
  const ctx = await setupTest();

  await writeStepCommit(ctx.context, ctx.claim, {
    next: 'continue',
    records: [],
    acknowledged: [],
  });

  const task = await ctx.readTask();

  expect(task.state).toBe('ready');
});

test('it moves a finished task to done', async () => {
  const ctx = await setupTest();

  await writeStepCommit(ctx.context, ctx.claim, { next: 'done', records: [], acknowledged: [] });

  const task = await ctx.readTask();

  expect(task.state).toBe('done');
});

test('it keeps a task ready when input it did not read is still in its inbox', async () => {
  const ctx = await setupTest();
  const [message] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: ctx.taskID,
      contentSource: 'owner',
      erasable: { text: 'one more thing' },
    },
  ]);

  await writeStepCommit(ctx.context, ctx.claim, { next: 'wait', records: [], acknowledged: [] });

  const task = await ctx.readTask();

  expect(task).toMatchObject({
    state: 'ready',
    read_cursor: 0,
    last_inbox_sequence: message?.sequence,
  });
});

test('it moves the read cursor over the contiguous run of acknowledged inbox records', async () => {
  const ctx = await setupTest();
  const messages = await writeInboxRecords(
    ctx.context,
    ['first', 'second', 'third'].map((text) => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: ctx.taskID,
      erasable: { text },
    })),
  );
  const [first, second, third] = messages.map((message) => message.sequence);

  if (first === undefined || second === undefined || third === undefined) {
    throw new Error('the setup wrote fewer than 3 messages');
  }

  await writeStepCommit(ctx.context, ctx.claim, {
    next: 'wait',
    records: [],
    acknowledged: [first, third],
  });

  const task = await ctx.readTask();

  expect(task).toMatchObject({ state: 'ready', read_cursor: first });
});

test('it writes the step records and the commit record with its step key', async () => {
  const ctx = await setupTest();

  await writeStepCommit(ctx.context, ctx.claim, {
    next: 'wait',
    records: [
      {
        kind: 'turn_finished',
        definitions: { snapshotHash: 'sha256:test' },
        payload: { turns: 1 },
      },
    ],
    acknowledged: [],
    sessionBoundary: 'entry-42',
  });

  const records = await ctx.db
    .selectFrom('records')
    .select(['kind', 'thread', 'step_key'])
    .where('sequence', '>', 2)
    .execute();
  const task = await ctx.readTask();

  expect(records).toStrictEqual([
    { kind: 'turn_finished', thread: ctx.taskID, step_key: null },
    { kind: 'task.step_committed', thread: ctx.taskID, step_key: `${ctx.taskID}:1` },
  ]);
  expect(task.session_boundary).toBe('entry-42');
});

test('it sets each timer the step asked for', async () => {
  const ctx = await setupTest();

  await writeStepCommit(ctx.context, ctx.claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 2_000_000 }],
  });

  const timers = await ctx.db
    .selectFrom('timers')
    .select(['task_id', 'due_at', 'set_sequence', 'fired_at', 'fired_sequence'])
    .execute();
  const timer = await ctx.db.selectFrom('timers').select('timer_id').executeTakeFirstOrThrow();

  expect(timer.timer_id).toBeString();
  expect(timers).toStrictEqual([
    {
      task_id: ctx.taskID,
      due_at: 2_000_000,
      set_sequence: 3,
      fired_at: null,
      fired_sequence: null,
    },
  ]);
});

test('it frees the lease once the step commits', async () => {
  const ctx = await setupTest();

  await writeStepCommit(ctx.context, ctx.claim, { next: 'wait', records: [], acknowledged: [] });

  const lease = await ctx.db.selectFrom('leases').selectAll().executeTakeFirstOrThrow();

  expect(lease).toMatchObject({ holder: null, expires_at: null, generation: 1 });
});

test('it commits a step key once, and a second commit changes nothing', async () => {
  const ctx = await setupTest();

  await writeStepCommit(ctx.context, ctx.claim, {
    next: 'continue',
    records: [],
    acknowledged: [],
  });

  // the lease the rerun of the same step would hold
  const rerun = await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  if (rerun === null) {
    throw new Error('the rerun found no task');
  }
  const second = writeStepCommit(
    ctx.context,
    { lease: rerun.lease, stepKey: ctx.claim.stepKey },
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
    `step ${ctx.claim.stepKey} has already committed`,
  );
  expect(commits).toStrictEqual([{ step_key: ctx.claim.stepKey }]);
});

test('it commits nothing once the lease expired', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(60_000);

  const commit = writeStepCommit(ctx.context, ctx.claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
  });

  await commit.catch(() => {});

  const task = await ctx.readTask();

  expect(commit).rejects.toThrow(LeaseLostError);
  expect(task.state).toBe('running');
});

test('it commits nothing once another runner claimed the task', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(60_000);
  await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  const commit = writeStepCommit(ctx.context, ctx.claim, {
    next: 'done',
    records: [],
    acknowledged: [],
  });

  await commit.catch(() => {});

  const task = await ctx.readTask();

  expect(commit).rejects.toThrow(LeaseLostError);
  expect(task.committed_steps).toBe(0);
});

test('it refuses a step record that carries a step key', async () => {
  const ctx = await setupTest();

  const commit = writeStepCommit(ctx.context, ctx.claim, {
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

  const commit = writeStepCommit(ctx.context, ctx.claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: Number.NaN }],
  });

  await commit.catch(() => {});

  const task = await ctx.readTask();

  expect(commit).rejects.toThrowWithMessage(
    Error,
    "a step's timer is due at NaN, which is no time",
  );
  expect(task.committed_steps).toBe(0);
});

test('it reaches step.commit.before and step.commit.after around the commit', async () => {
  const ctx = await setupTest();
  const reached: FaultPointID[] = [];

  setFaultPointHandler((id) => {
    reached.push(id);
  });
  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  await writeStepCommit(ctx.context, ctx.claim, { next: 'wait', records: [], acknowledged: [] });

  expect(reached).toStrictEqual(['step.commit.before', 'step.commit.after']);
});
