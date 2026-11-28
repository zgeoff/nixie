import { expect, test } from 'bun:test';
import { buildMockTaskStartBounds } from '../../test-utils/build-mock-task-start-bounds';
import { planTaskStart } from './plan-task-start';
import { renderChoiceRefusal } from './render-choice-refusal';

test('it plans a start with no options as the persona, no memory, the default tools and the default limits', () => {
  expect(
    planTaskStart(
      {},
      {
        tools: ['tasks.list', 'task.message', 'task.start', 'time.now', 'web_fetch'],
        memory: 'read',
        persona: 'default',
        log: 'own',
      },
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'planned',
    options: {
      model: null,
      profile: null,
      persona: 'default',
      memory: 'none',
      log: 'own',
      tools: ['tasks.list', 'task.message', 'task.report', 'time.now'],
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
        log: 'own',
        tools: ['web_fetch'],
        report: 'next_turn',
        limits: { turns: 8 },
      },
      {
        tools: ['tasks.list', 'task.message', 'time.now', 'web_fetch'],
        memory: 'read',
        persona: 'default',
        log: 'own',
      },
      buildMockTaskStartBounds({
        models: [
          { name: 'second-look', profile: 'router-b', description: 'Another family', missing: [] },
        ],
      }),
    ),
  ).toStrictEqual({
    status: 'planned',
    options: {
      model: 'second-look',
      profile: 'router-b',
      persona: 'none',
      memory: 'none',
      log: 'own',
      tools: ['tasks.list', 'task.message', 'task.report', 'web_fetch'],
      report: 'next_turn',
      limits: { turns: 8, dollars: 2 },
    },
  });
});

test('it gives a task that reads memory the memory read tools that its starter holds', () => {
  const plan = planTaskStart(
    { memory: 'read', tools: [] },
    {
      tools: ['tasks.list', 'task.message', 'memory.recall', 'memory.remember'],
      memory: 'read',
      persona: 'default',
      log: 'own',
    },
    buildMockTaskStartBounds(),
  );

  expect(plan).toStrictEqual({
    status: 'planned',
    options: {
      model: null,
      profile: null,
      persona: 'default',
      memory: 'read',
      log: 'own',
      tools: ['tasks.list', 'task.message', 'task.report', 'memory.recall'],
      report: 'wake',
      limits: { turns: 25, dollars: 2 },
    },
  });
});

test('it leaves out each base tool that its starter lacks', () => {
  const plan = planTaskStart(
    { tools: [] },
    { tools: ['task.message'], memory: 'read', persona: 'default', log: 'own' },
    buildMockTaskStartBounds(),
  );

  expect(plan).toStrictEqual({
    status: 'planned',
    options: {
      model: null,
      profile: null,
      persona: 'default',
      memory: 'none',
      log: 'own',
      tools: ['task.message', 'task.report'],
      report: 'wake',
      limits: { turns: 25, dollars: 2 },
    },
  });
});

test('it refuses a model that is not selectable', () => {
  expect(
    planTaskStart(
      { model: 'opus-high' },
      { tools: ['tasks.list', 'task.message'], memory: 'read', persona: 'default', log: 'own' },
      buildMockTaskStartBounds({
        models: [
          { name: 'second-look', profile: 'router-b', description: 'Another family', missing: [] },
        ],
      }),
    ),
  ).toStrictEqual({ status: 'refused', refusal: { reason: 'unknown_model', model: 'opus-high' } });
});

test('it refuses a tool list wider than its starter holds', () => {
  expect(
    planTaskStart(
      { tools: ['web_fetch', 'memory.remember', 'time.now'] },
      {
        tools: ['tasks.list', 'task.message', 'task.report', 'time.now'],
        memory: 'read',
        persona: 'default',
        log: 'own',
      },
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'refused',
    refusal: {
      reason: 'wider_tools',
      tools: ['web_fetch', 'memory.remember'],
      accepted: ['tasks.list', 'task.message', 'task.report', 'time.now'],
    },
  });
});

test.each([
  ['turns', { turns: 101 }, 100],
  ['dollars', { dollars: 10.5 }, 10],
] as const)('it refuses %s above the max', (limit, limits, max) => {
  expect(
    planTaskStart(
      { limits },
      { tools: ['tasks.list', 'task.message'], memory: 'read', persona: 'default', log: 'own' },
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({ status: 'refused', refusal: { reason: 'over_limit', limit, max } });
});

test('it plans limits at the max', () => {
  expect(
    planTaskStart(
      { limits: { turns: 100, dollars: 10 } },
      { tools: ['tasks.list', 'task.message'], memory: 'read', persona: 'default', log: 'own' },
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'planned',
    options: {
      model: null,
      profile: null,
      persona: 'default',
      memory: 'none',
      log: 'own',
      tools: ['tasks.list', 'task.message', 'task.report'],
      report: 'wake',
      limits: { turns: 100, dollars: 10 },
    },
  });
});

test('it refuses a report shape that uses a keyword outside the table', () => {
  expect(
    planTaskStart(
      {
        reportShape: {
          properties: { city: { type: 'string', pattern: '^[A-Z]' } },
        },
      },
      { tools: ['tasks.list', 'task.message'], memory: 'none', persona: 'default', log: 'own' },
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'refused',
    refusal: {
      reason: 'report_shape',
      fault: { fault: 'keyword', path: 'city', keyword: 'pattern' },
    },
  });
});

test('it refuses a stranger that reads memory', () => {
  expect(
    planTaskStart(
      { persona: 'none', memory: 'read' },
      { tools: ['tasks.list', 'task.message'], memory: 'read', persona: 'default', log: 'own' },
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({ status: 'refused', refusal: { reason: 'stranger_with_memory' } });
});

test('it refuses a task that reads memory for a starter that does not', () => {
  expect(
    planTaskStart(
      { persona: 'default', memory: 'read' },
      {
        tools: ['tasks.list', 'task.message', 'task.start'],
        memory: 'none',
        persona: 'default',
        log: 'own',
      },
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({ status: 'refused', refusal: { reason: 'wider_memory' } });
});

test('it refuses the persona for a task whose starter runs with none', () => {
  expect(
    planTaskStart(
      { persona: 'default' },
      {
        tools: ['tasks.list', 'task.message', 'task.start'],
        memory: 'none',
        persona: 'none',
        log: 'own',
      },
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({ status: 'refused', refusal: { reason: 'wider_persona' } });
});

test("it plans a start with no persona from a starter that runs with none as the starter's", () => {
  expect(
    planTaskStart(
      {},
      {
        tools: ['tasks.list', 'task.message', 'task.start'],
        memory: 'none',
        persona: 'none',
        log: 'own',
      },
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'planned',
    options: {
      model: null,
      profile: null,
      persona: 'none',
      memory: 'none',
      log: 'own',
      tools: ['tasks.list', 'task.message', 'task.report'],
      report: 'wake',
      limits: { turns: 25, dollars: 2 },
    },
  });
});

test('it refuses a memory tool for a task with no memory', () => {
  expect(
    planTaskStart(
      { memory: 'none', tools: ['memory.recall'] },
      {
        tools: ['tasks.list', 'task.message', 'memory.recall'],
        memory: 'read',
        persona: 'default',
        log: 'own',
      },
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'refused',
    refusal: {
      reason: 'memory_tools',
      tools: ['memory.recall'],
      accepted: ['tasks.list', 'task.message'],
    },
  });
});

test('it refuses a tool that only the conversation can use, though the starter holds it', () => {
  expect(
    planTaskStart(
      { tools: ['skill_read'] },
      {
        tools: ['tasks.list', 'task.message', 'skill_read'],
        memory: 'read',
        persona: 'default',
        log: 'own',
      },
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'refused',
    refusal: {
      reason: 'conversation_tools',
      tools: ['skill_read'],
      accepted: ['tasks.list', 'task.message'],
    },
  });
});

test.each(['task.define', 'task.undefine'])(
  'it refuses a start that lists %s, which only the conversation holds',
  (tool) => {
    expect(
      planTaskStart(
        { tools: [tool] },
        {
          tools: ['tasks.list', 'task.message', tool],
          memory: 'read',
          persona: 'default',
          log: 'own',
        },
        buildMockTaskStartBounds({ conversationTools: ['task.define', 'task.undefine'] }),
      ),
    ).toStrictEqual({
      status: 'refused',
      refusal: {
        reason: 'conversation_tools',
        tools: [tool],
        accepted: ['tasks.list', 'task.message'],
      },
    });
  },
);

function setupTest() {
  const starter = {
    tools: [
      'tasks.list',
      'task.message',
      'memory.recall',
      'proposals.pending',
      'memory.remember',
      'memory.edit',
      'moment.edit',
    ],
    memory: 'read',
    persona: 'default',
    log: 'own',
  } as const;

  const readOptions = (tools: readonly string[]) => ({
    model: null,
    profile: null,
    persona: starter.persona,
    memory: starter.memory,
    log: 'own' as const,
    tools,
    report: 'wake' as const,
    limits: { turns: 25, dollars: 2 },
  });

  return { starter, readOptions };
}

test('it gives a task that reads memory each memory write tool that the start names', () => {
  const ctx = setupTest();

  expect(
    planTaskStart(
      { memory: 'read', tools: ['memory.recall', 'memory.edit'] },
      ctx.starter,
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'planned',
    options: ctx.readOptions([
      'tasks.list',
      'task.message',
      'task.report',
      'memory.recall',
      'memory.edit',
      'proposals.pending',
    ]),
  });
});

test('it gives a task that reads memory a moment write tool that the start names', () => {
  const ctx = setupTest();

  expect(
    planTaskStart(
      { memory: 'read', tools: ['moment.edit'] },
      ctx.starter,
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'planned',
    options: ctx.readOptions([
      'tasks.list',
      'task.message',
      'task.report',
      'moment.edit',
      'memory.recall',
      'proposals.pending',
    ]),
  });
});

test('it plans a memory write tool that the start names by its SDK name under the nixie name', () => {
  const ctx = setupTest();

  expect(
    planTaskStart(
      { memory: 'read', tools: ['mcp__nixie__memory_edit'] },
      ctx.starter,
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'planned',
    options: ctx.readOptions([
      'tasks.list',
      'task.message',
      'task.report',
      'memory.edit',
      'memory.recall',
      'proposals.pending',
    ]),
  });
});

test('it refuses a memory write tool that the starter lacks, though the task reads memory', () => {
  expect(
    planTaskStart(
      { memory: 'read', tools: ['memory.edit'] },
      {
        tools: ['tasks.list', 'task.message', 'memory.recall'],
        memory: 'read',
        persona: 'default',
        log: 'own',
      },
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'refused',
    refusal: {
      reason: 'wider_tools',
      tools: ['memory.edit'],
      accepted: ['tasks.list', 'task.message', 'memory.recall'],
    },
  });
});

test('it refuses a memory write tool for a task that does not read memory', () => {
  const ctx = setupTest();

  expect(
    planTaskStart({ tools: ['memory.edit'] }, ctx.starter, buildMockTaskStartBounds()),
  ).toStrictEqual({
    status: 'refused',
    refusal: {
      reason: 'memory_tools',
      tools: ['memory.edit'],
      accepted: ['tasks.list', 'task.message'],
    },
  });
});

test('it lists each memory write tool that the starter holds as accepted when the task reads memory', () => {
  const ctx = setupTest();

  expect(
    planTaskStart(
      { memory: 'read', tools: ['web_fetch'] },
      ctx.starter,
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({
    status: 'refused',
    refusal: {
      reason: 'wider_tools',
      tools: ['web_fetch'],
      accepted: [
        'tasks.list',
        'task.message',
        'memory.recall',
        'proposals.pending',
        'memory.remember',
        'memory.edit',
        'moment.edit',
      ],
    },
  });
});

test('it gives a task that reads memory no write tool when the start names none', () => {
  const ctx = setupTest();

  expect(planTaskStart({ memory: 'read' }, ctx.starter, buildMockTaskStartBounds())).toStrictEqual({
    status: 'planned',
    options: ctx.readOptions([
      'tasks.list',
      'task.message',
      'task.report',
      'memory.recall',
      'proposals.pending',
    ]),
  });
});

test.each([
  ['conversation', 'conversation'],
  ['own', 'own'],
  [undefined, 'own'],
] as const)('it plans a start with the log choice %s as the log %s', (choice, planned) => {
  const plan = planTaskStart(
    { log: choice },
    {
      tools: ['tasks.list', 'task.message'],
      memory: 'none',
      persona: 'default',
      log: 'conversation',
    },
    buildMockTaskStartBounds(),
  );

  expect(plan).toMatchObject({ status: 'planned', options: { log: planned } });
});

test('it refuses the conversation log from a starter without it', () => {
  expect(
    planTaskStart(
      { log: 'conversation' },
      { tools: ['tasks.list', 'task.message'], memory: 'none', persona: 'default', log: 'own' },
      buildMockTaskStartBounds(),
    ),
  ).toStrictEqual({ status: 'refused', refusal: { reason: 'wider_log' } });
});

test('it plans the own log for a starter without the grant when the start names none', () => {
  expect(
    planTaskStart(
      {},
      { tools: ['tasks.list', 'task.message'], memory: 'none', persona: 'default', log: 'own' },
      buildMockTaskStartBounds(),
    ),
  ).toMatchObject({ status: 'planned', options: { log: 'own' } });
});

test('it renders the wider log refusal as the sentence the model reads', () => {
  expect(renderChoiceRefusal({ reason: 'wider_log' })).toBe(
    "You can give a task the conversation's log only when you hold it yourself, and you do not.",
  );
});

test('it gives a task worker.run only when its start lists it and its starter holds it', () => {
  const starter = {
    tools: ['tasks.list', 'task.message', 'time.now', 'worker.run'],
    memory: 'none',
    persona: 'default',
    log: 'own',
  } as const;

  const listed = planTaskStart({ tools: ['worker.run'] }, starter, buildMockTaskStartBounds());
  const unlisted = planTaskStart({}, starter, buildMockTaskStartBounds());

  expect({
    listed: listed.status === 'planned' ? listed.options.tools : listed,
    unlisted: unlisted.status === 'planned' ? unlisted.options.tools : unlisted,
  }).toStrictEqual({
    listed: ['tasks.list', 'task.message', 'task.report', 'worker.run'],
    unlisted: ['tasks.list', 'task.message', 'task.report', 'time.now'],
  });
});

test('it refuses worker.run for a task whose starter lacks it', () => {
  const planned = planTaskStart(
    { tools: ['worker.run'] },
    {
      tools: ['tasks.list', 'task.message', 'time.now'],
      memory: 'none',
      persona: 'default',
      log: 'own',
    },
    buildMockTaskStartBounds(),
  );

  expect(planned).toMatchObject({ status: 'refused', refusal: { reason: 'wider_tools' } });
});

test.each(['read', 'none', 'self_notes'] as const)(
  'it refuses self notes from a starter that holds memory at %s',
  (memory) => {
    const plan = planTaskStart(
      { memory: 'self_notes' },
      { tools: ['tasks.list', 'task.message'], memory, persona: 'default', log: 'own' },
      buildMockTaskStartBounds(),
    );

    expect(plan).toStrictEqual({ status: 'refused', refusal: { reason: 'self_notes_start' } });
  },
);

test('it tells the model to define the task when a start asks for self notes', () => {
  expect(renderChoiceRefusal({ reason: 'self_notes_start' })).toContain('task.define');
});

test('it refuses self notes for a task with no persona', () => {
  const plan = planTaskStart(
    { memory: 'self_notes', persona: 'none' },
    { tools: ['tasks.list', 'task.message'], memory: 'self_notes', persona: 'default', log: 'own' },
    buildMockTaskStartBounds(),
  );

  expect(plan).toStrictEqual({ status: 'refused', refusal: { reason: 'self_notes_start' } });
});

test('it refuses self notes with the instruction to define the task, whatever persona a task with no persona asks for', () => {
  const plan = planTaskStart(
    { memory: 'self_notes', persona: 'default' },
    { tools: ['tasks.list', 'task.message'], memory: 'none', persona: 'none', log: 'own' },
    buildMockTaskStartBounds(),
  );

  expect(plan).toStrictEqual({ status: 'refused', refusal: { reason: 'self_notes_start' } });
});

test('it gives a task the pins of each tool it gets and none of the tools it leaves out', () => {
  const plan = planTaskStart(
    { tools: ['gmail.search'] },
    {
      tools: ['tasks.list', 'task.message', 'time.now', 'gmail.search', 'gmail.read'],
      memory: 'none',
      persona: 'default',
      log: 'own',
      connectionPins: {
        mcp__nixie__gmail_search: ['k3x9m2p7qa'],
        'gmail.read': ['p8d2v6n4rc'],
      },
    },
    buildMockTaskStartBounds(),
  );

  expect(plan).toMatchObject({
    status: 'planned',
    options: { connectionPins: { 'gmail.search': ['k3x9m2p7qa'] } },
  });
});

test('it gives a task no pins when its starter pins none of its tools', () => {
  const plan = planTaskStart(
    {},
    {
      tools: ['tasks.list', 'task.message', 'time.now', 'gmail.search'],
      memory: 'none',
      persona: 'default',
      log: 'own',
      connectionPins: { 'gmail.search': ['k3x9m2p7qa'] },
    },
    buildMockTaskStartBounds(),
  );

  expect(plan).not.toHaveProperty('options.connectionPins');
});

test('it plans a start with no limits as a task with none when the config sets none', () => {
  expect(
    planTaskStart(
      {},
      { tools: ['tasks.list', 'task.message'], memory: 'read', persona: 'default', log: 'own' },
      buildMockTaskStartBounds({
        limits: {
          default: { turns: null, dollars: null },
          max: { turns: null, dollars: null },
        },
      }),
    ),
  ).toStrictEqual({
    status: 'planned',
    options: {
      model: null,
      profile: null,
      persona: 'default',
      memory: 'none',
      log: 'own',
      tools: ['tasks.list', 'task.message', 'task.report'],
      report: 'wake',
      limits: { turns: null, dollars: null },
    },
  });
});

test('it plans the limits a start sets on a meter with no max, and leaves the other meter with none', () => {
  expect(
    planTaskStart(
      { limits: { turns: 5000 } },
      { tools: ['tasks.list', 'task.message'], memory: 'read', persona: 'default', log: 'own' },
      buildMockTaskStartBounds({
        limits: {
          default: { turns: null, dollars: null },
          max: { turns: null, dollars: null },
        },
      }),
    ),
  ).toStrictEqual({
    status: 'planned',
    options: {
      model: null,
      profile: null,
      persona: 'default',
      memory: 'none',
      log: 'own',
      tools: ['tasks.list', 'task.message', 'task.report'],
      report: 'wake',
      limits: { turns: 5000, dollars: null },
    },
  });
});

test('it refuses a value above the max of one meter when the other meter has no max', () => {
  expect(
    planTaskStart(
      { limits: { turns: 5000, dollars: 11 } },
      { tools: ['tasks.list', 'task.message'], memory: 'read', persona: 'default', log: 'own' },
      buildMockTaskStartBounds({
        limits: {
          default: { turns: null, dollars: null },
          max: { turns: null, dollars: 10 },
        },
      }),
    ),
  ).toStrictEqual({
    status: 'refused',
    refusal: { reason: 'over_limit', limit: 'dollars', max: 10 },
  });
});
