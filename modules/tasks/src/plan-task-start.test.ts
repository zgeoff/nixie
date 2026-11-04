import { expect, test } from 'bun:test';
import { planTaskStart } from './plan-task-start';
import { buildMockTaskStartBounds } from './test-utils/build-mock-task-start-bounds';

test('it plans a start with no options as the persona, no memory, the default tools and the default limits', () => {
  expect(
    planTaskStart(
      {},
      ['tasks.list', 'task.message', 'task.start', 'time.now', 'web_fetch'],
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'planned',
    options: {
      model: null,
      profile: null,
      persona: 'default',
      memory: 'none',
      tools: ['tasks.list', 'task.message', 'time.now'],
      report: 'wake',
      limits: { turns: 25, dollars: 2 },
    },
  });
});

test('it plans a stranger on a selectable model with the tools asked for and the limits set', () => {
  expect(
    planTaskStart(
      {
        model: 'second-look',
        persona: 'none',
        memory: 'none',
        tools: ['web_fetch'],
        report: 'next_turn',
        limits: { turns: 8 },
      },
      ['tasks.list', 'task.message', 'time.now', 'web_fetch'],
      buildMockTaskStartBounds({
        models: [{ name: 'second-look', profile: 'router-b', description: 'Another family' }],
      }),
    ),
  ).toStrictEqual({
    status: 'planned',
    options: {
      model: 'second-look',
      profile: 'router-b',
      persona: 'none',
      memory: 'none',
      tools: ['tasks.list', 'task.message', 'web_fetch'],
      report: 'next_turn',
      limits: { turns: 8, dollars: 2 },
    },
  });
});

test('it gives a task that reads memory the memory read tools that its starter holds', () => {
  const plan = planTaskStart(
    { memory: 'read', tools: [] },
    ['tasks.list', 'task.message', 'memory.recall', 'memory.remember'],
    buildMockTaskStartBounds(),
  );

  expect(plan).toMatchObject({
    status: 'planned',
    options: { memory: 'read', tools: ['tasks.list', 'task.message', 'memory.recall'] },
  });
});

test('it leaves out each base tool that its starter lacks', () => {
  const plan = planTaskStart({ tools: [] }, ['task.message'], buildMockTaskStartBounds());

  expect(plan).toMatchObject({ status: 'planned', options: { tools: ['task.message'] } });
});

test('it refuses a model that is not selectable', () => {
  expect(
    planTaskStart(
      { model: 'opus-high' },
      ['tasks.list', 'task.message'],
      buildMockTaskStartBounds({
        models: [{ name: 'second-look', profile: 'router-b', description: 'Another family' }],
      }),
    ),
  ).toStrictEqual({ status: 'refused', refusal: { reason: 'unknown_model', model: 'opus-high' } });
});

test('it refuses a tool list wider than its starter holds', () => {
  expect(
    planTaskStart(
      { tools: ['web_fetch', 'memory.remember', 'time.now'] },
      ['tasks.list', 'task.message', 'time.now'],
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'refused',
    refusal: { reason: 'wider_tools', tools: ['web_fetch', 'memory.remember'] },
  });
});

test.each([
  ['turns', { turns: 101 }, 100],
  ['dollars', { dollars: 10.5 }, 10],
] as const)('it refuses %s above the max', (limit, limits, max) => {
  expect(
    planTaskStart({ limits }, ['tasks.list', 'task.message'], buildMockTaskStartBounds()),
  ).toStrictEqual({ status: 'refused', refusal: { reason: 'over_limit', limit, max } });
});

test('it plans limits at the max', () => {
  expect(
    planTaskStart(
      { limits: { turns: 100, dollars: 10 } },
      ['tasks.list', 'task.message'],
      buildMockTaskStartBounds(),
    ),
  ).toMatchObject({ status: 'planned', options: { limits: { turns: 100, dollars: 10 } } });
});

test('it refuses a stranger that reads memory', () => {
  expect(
    planTaskStart(
      { persona: 'none', memory: 'read' },
      ['tasks.list', 'task.message'],
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({ status: 'refused', refusal: { reason: 'stranger_with_memory' } });
});

test('it refuses a memory tool for a task with no memory', () => {
  expect(
    planTaskStart(
      { memory: 'none', tools: ['memory.recall'] },
      ['tasks.list', 'task.message', 'memory.recall'],
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'refused',
    refusal: { reason: 'memory_tools', tools: ['memory.recall'] },
  });
});

test('it refuses a tool that only the conversation can use, though the starter holds it', () => {
  expect(
    planTaskStart(
      { tools: ['skill_read'] },
      ['tasks.list', 'task.message', 'skill_read'],
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'refused',
    refusal: { reason: 'conversation_tools', tools: ['skill_read'] },
  });
});

test('it refuses a memory write tool for a task that reads memory', () => {
  expect(
    planTaskStart(
      { memory: 'read', tools: ['memory.remember'] },
      ['tasks.list', 'task.message', 'memory.remember'],
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'refused',
    refusal: { reason: 'memory_tools', tools: ['memory.remember'] },
  });
});
