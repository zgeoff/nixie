import { expect, mock, test } from 'bun:test';
import { createTask } from '../create-task';
import type { RunStep } from '../types';
import { runTaskSteps } from './run-task-steps';
import { startTestTasks } from './start-test-tasks';

// a writer with the tasks projections, on a test clock at 1,000,000 ms
async function setupTest() {
  const tasks = await startTestTasks();

  return { context: tasks.context, clock: tasks.clock };
}

test('it runs the step of each task that has work until every task finishes', async () => {
  const ctx = await setupTest();
  const first = await createTask(ctx.context, 'send the weekly summary');
  const second = await createTask(ctx.context, 'book the dentist');

  const runStep = mock<RunStep>(() =>
    Promise.resolve({ next: 'done', records: [], acknowledged: [] }),
  );

  const steps = await runTaskSteps(ctx.context, {
    steps: { [first]: runStep, [second]: runStep },
    advance: (durationMs) => {
      ctx.clock.advance(durationMs);
    },
    maxSteps: 10,
  });

  expect(steps).toBe(2);
  expect(runStep.mock.calls.map(([input]) => input.taskID)).toIncludeSameMembers([first, second]);
});

test('it moves the clock to the next timer when no task has work', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'send the weekly summary');

  const runStep = mock<RunStep>(() =>
    Promise.resolve({ next: 'done', records: [], acknowledged: [] }),
  ).mockResolvedValueOnce({
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_060_000 }],
  });

  await runTaskSteps(ctx.context, {
    steps: { [taskID]: runStep },
    advance: (durationMs) => {
      ctx.clock.advance(durationMs);
    },
    probeDone: () => Promise.resolve(runStep.mock.calls.length >= 2),
    maxSteps: 10,
  });

  expect(ctx.clock.now()).toBe(1_060_000);

  expect(
    runStep.mock.calls.map(([input]) => input.inbox.map((record) => record.kind)),
  ).toStrictEqual([[], ['timer.fired']]);
});

test('it stops after the step at which probeDone holds', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'send the weekly summary');

  const runStep = mock<RunStep>(() =>
    Promise.resolve({ next: 'continue', records: [], acknowledged: [] }),
  );

  const steps = await runTaskSteps(ctx.context, {
    steps: { [taskID]: runStep },
    advance: (durationMs) => {
      ctx.clock.advance(durationMs);
    },
    probeDone: () => Promise.resolve(runStep.mock.calls.length >= 3),
    maxSteps: 10,
  });

  expect(steps).toBe(3);
});

test('it throws when the tasks still have work after the most steps', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'send the weekly summary');

  const runStep = mock<RunStep>(() =>
    Promise.resolve({ next: 'continue', records: [], acknowledged: [] }),
  );

  const run = runTaskSteps(ctx.context, {
    steps: { [taskID]: runStep },
    advance: (durationMs) => {
      ctx.clock.advance(durationMs);
    },
    maxSteps: 4,
  });

  await run.catch(() => {});

  expect(run).rejects.toThrow('the tasks ran 4 steps and still had work');
});

test('it throws on a task it has no step for', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'send the weekly summary');

  const run = runTaskSteps(ctx.context, {
    steps: {},
    advance: (durationMs) => {
      ctx.clock.advance(durationMs);
    },
    maxSteps: 4,
  });

  await run.catch(() => {});

  expect(run).rejects.toThrow(`the run has no step for the task ${taskID}`);
});
