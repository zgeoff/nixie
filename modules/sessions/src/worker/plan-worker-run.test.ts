import { expect, test } from 'bun:test';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import type { WorkerRunFacts } from './plan-worker-run';
import { planWorkerRun } from './plan-worker-run';

function setupTest(overrides: Partial<WorkerRunFacts> = {}, left: number | null = null) {
  const context = buildMockToolContext({
    run: {
      tools: ['notes_read', 'mcp__nixie__web_fetch', 'web_fetch'],
      stepRunID: 'step-a',
      session: {
        key: 'session-1',
        invalidatedThrough: 0,
        step: {
          signal: new AbortController().signal,
          interrupt: new AbortController().signal,
          readLeftDollars: () => left,
          onSpend: () => {},
        },
      },
    },
  });

  return {
    call: { callID: 'call-1', callSequence: 7, question: 'Which?', tools: ['notes_read'] },
    run: context.run,
    isRunning: true,
    bounds: {
      memoryTools: { read: ['memory.recall'], write: ['memory.remember'] },
      conversationTools: ['log.forget'],
    },
    limits: { minutes: 10, turns: 25, tokens: 2_000_000, dollars: 2 },
    now: 5000,
    ...overrides,
  } satisfies WorkerRunFacts;
}

test('it plans a run with the tools the caller holds and the configured limits', () => {
  const planned = planWorkerRun(setupTest());

  expect(planned).toMatchObject({
    status: 'planned',
    plan: {
      question: 'Which?',
      tools: ['notes_read'],
      limits: { dollars: 2 },
      isTaskLimit: false,
      caller: { callID: 'call-1', callSequence: 7, stepRunID: 'step-a' },
    },
  });
});

test('it caps the dollars at what the caller has left, and says so', () => {
  const planned = planWorkerRun(setupTest({}, 0.5));

  expect(planned).toMatchObject({
    status: 'planned',
    plan: { limits: { dollars: 0.5 }, isTaskLimit: true },
  });
});

test.each<
  [
    string,
    {
      readonly left?: number;
      readonly tools?: string[];
      readonly held?: string[];
      readonly isRunning?: boolean;
    },
    string,
  ]
>([
  ['a caller at its dollar limit', { left: 0 }, 'reached its dollar limit'],
  ['a tool the caller does not hold', { tools: ['web_search'] }, 'you do not hold web_search'],
  ['a tool a worker never holds', { tools: ['task.start'], held: ['task.start'] }, 'can never use'],
  ['a conversation tool', { tools: ['log.forget'], held: ['log.forget'] }, 'can never use'],
  ['a memory tool', { tools: ['memory.recall'], held: ['memory.recall'] }, 'cannot get'],
  ['a stopped worker', { isRunning: false }, 'not running'],
])('it refuses %s', (_name, change, sentence) => {
  const facts = setupTest({ isRunning: change.isRunning ?? true }, change.left ?? null);
  const call = { ...facts.call, tools: change.tools ?? facts.call.tools };
  const run = { ...facts.run, tools: [...facts.run.tools, ...(change.held ?? [])] };

  expect(planWorkerRun({ ...facts, call, run })).toStrictEqual({
    status: 'refused',
    sentence: expect.toInclude(sentence),
  });
});

test.each([
  'task.start',
  'task.message',
  'task.close',
  'tasks.list',
  'task.report',
  'turn.end_silently',
  'worker.run',
])('it refuses %s, which a worker never holds', (tool) => {
  const facts = setupTest();
  const call = { ...facts.call, tools: [tool] };
  const run = { ...facts.run, tools: [...facts.run.tools, tool] };

  expect(planWorkerRun({ ...facts, call, run })).toStrictEqual({
    status: 'refused',
    sentence: `A worker can never use ${tool}, so nixie started none.`,
  });
});

test('it refuses a call that no model turn made', () => {
  const facts = setupTest();

  const planned = planWorkerRun({
    ...facts,
    run: {
      runID: facts.run.runID,
      thread: 'task-1',
      logThread: 'task-1',
      tools: [],
      model: facts.run.model,
    },
  });

  expect(planned).toStrictEqual({
    status: 'refused',
    sentence: 'Only a model turn can run a worker.',
  });
});

test('it takes a tool by the name the model sees', () => {
  const facts = setupTest();
  const planned = planWorkerRun({ ...facts, call: { ...facts.call, tools: ['notes_read'] } });

  expect(planned.status).toBe('planned');
});
