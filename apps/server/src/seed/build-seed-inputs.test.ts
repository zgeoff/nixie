import { expect, test } from 'bun:test';
import { buildCodingActionTools } from '@heynixie/coding';
import { buildDefinitionsSnapshot } from '@heynixie/definitions';
import { mcpConfigSchema } from '@heynixie/mcp';
import { buildMockTaskStartBounds } from '@heynixie/tasks/test-utils';
import type { ToolDefinition } from '@heynixie/tools';
import { buildTestModelsConfig } from '../test-utils/build-test-models-config';
import { buildLogConnector } from '../test/build-log-connector';
import { buildSeedInputs } from './build-seed-inputs';

test("it puts the queue check's tool declaration in the policy, beside the conversation's tools", () => {
  const config = {
    definitions: { source: { kind: 'path', path: '/srv/definitions' }, probeIntervalMs: 300_000 },
    models: buildTestModelsConfig({ modelURL: 'https://models.example.test' }),
    owner: { name: 'Marisol', pronouns: { they: 'she', their: 'her' } },
  } as const;

  const tool = buildLogConnector(() => {}).tool;

  const inputs = buildSeedInputs(config, {
    definitions: [],
    actions: { logConnector: { tool }, queuedTools: [] },
    taskBounds: buildMockTaskStartBounds(),
  });

  expect(inputs.buildPolicy({}).tools).toStrictEqual([
    {
      name: 'actions.log',
      effects: ['write'],
      destinations: [],
      amount: null,
      content: [],
      results: { logged: 'owner_data' },
    },
  ]);
});

test("it puts the coding runner's queued actions in the policy and the task tool names, and no conversation tool list holds them", () => {
  const config = {
    definitions: { source: { kind: 'path', path: '/srv/definitions' }, probeIntervalMs: 300_000 },
    models: buildTestModelsConfig({ modelURL: 'https://models.example.test' }),
    owner: { name: 'Marisol', pronouns: { they: 'she', their: 'her' } },
  } as const;

  const tool = buildLogConnector(() => {}).tool;

  const inputs = buildSeedInputs(config, {
    definitions: [],
    actions: { logConnector: { tool }, queuedTools: buildCodingActionTools() },
    taskBounds: buildMockTaskStartBounds(),
  });

  expect({
    policy: inputs.buildPolicy({}).tools.map((declared) => declared.name),
    taskTools: inputs.tasks.toolNames,
  }).toStrictEqual({
    policy: ['actions.log', 'coding.spawn', 'coding.stop'],
    taskTools: ['actions.log', 'coding.spawn', 'coding.stop'],
  });
});

test.each([
  ['Marisol', '5992c8fb7f4cdcd0cf11bb468fde07ca8e2871cfb383164cd40f509b5d9c5673'],
  [null, '963b739c5ad572789ee2bd1cf45a2e6cd05456762f4af11bd86389346a1607f3'],
])(
  'it builds the pinned policy hash from the built-in checker prompts for the owner name %s when no prompt has an override',
  (name, policyHash) => {
    const config = {
      definitions: { source: { kind: 'path', path: '/srv/d' }, probeIntervalMs: 300_000 },
      models: buildTestModelsConfig({ modelURL: 'https://models.example.test' }),
      owner: { name, pronouns: { they: 'she', their: 'her' } },
    } as const;

    const tool = buildLogConnector(() => {}).tool;

    const snapshot = buildDefinitionsSnapshot({
      skills: [],
      conversationSkills: [],
      tasks: [],
      persona: '# P\n',
      policy: buildSeedInputs(config, {
        definitions: [],
        actions: { logConnector: { tool }, queuedTools: [] },
        taskBounds: buildMockTaskStartBounds(),
      }).buildPolicy({}),
      prompts: {},
    });

    expect(snapshot.policyHash).toBe(policyHash);
  },
);

test("it changes the snapshot hash when the queue check's tool declaration changes", () => {
  const config = {
    definitions: { source: { kind: 'path', path: '/srv/definitions' }, probeIntervalMs: 300_000 },
    models: buildTestModelsConfig({ modelURL: 'https://models.example.test' }),
    owner: { name: 'Marisol', pronouns: { they: 'she', their: 'her' } },
  } as const;

  const tool = buildLogConnector(() => {}).tool;

  const changed: ToolDefinition = {
    ...tool,
    declaration: { ...tool.declaration, effects: ['write', 'send'] },
  };

  const hashes = [tool, changed].map(
    (logTool) =>
      buildDefinitionsSnapshot({
        skills: [],
        conversationSkills: [],
        tasks: [],
        persona: '# Persona\n',
        policy: buildSeedInputs(config, {
          definitions: [],
          actions: { logConnector: { tool: logTool }, queuedTools: [] },
          taskBounds: buildMockTaskStartBounds(),
        }).buildPolicy({}),
        prompts: {},
      }).snapshotHash,
  );

  expect(hashes[0]).not.toBe(hashes[1]);
});

test.each([
  [
    'content-checker',
    { 'content-checker': { parts: { safety: 'Give one reason.' }, template: null } },
  ],
  [
    'retirement-checker',
    { 'retirement-checker': { parts: {}, template: '{{ parts.instruction }}' } },
  ],
] as const)('it changes the policy hash when the %s prompt has an override', (_label, prompts) => {
  const config = {
    definitions: { source: { kind: 'path', path: '/srv/d' }, probeIntervalMs: 300_000 },
    models: buildTestModelsConfig({ modelURL: 'https://models.example.test' }),
    owner: { name: 'Marisol', pronouns: { they: 'she', their: 'her' } },
  } as const;

  const tool = buildLogConnector(() => {}).tool;

  const inputs = buildSeedInputs(config, {
    definitions: [],
    actions: { logConnector: { tool }, queuedTools: [] },
    taskBounds: buildMockTaskStartBounds(),
  });

  const snapshot = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    tasks: [],
    persona: '# P\n',
    policy: inputs.buildPolicy(prompts),
    prompts,
  });

  expect(snapshot.policyHash).not.toBe(
    '5992c8fb7f4cdcd0cf11bb468fde07ca8e2871cfb383164cd40f509b5d9c5673',
  );
});

test('it keeps the policy hash when only a prompt other than the checkers has an override', () => {
  const config = {
    definitions: { source: { kind: 'path', path: '/srv/d' }, probeIntervalMs: 300_000 },
    models: buildTestModelsConfig({ modelURL: 'https://models.example.test' }),
    owner: { name: 'Marisol', pronouns: { they: 'she', their: 'her' } },
  } as const;

  const tool = buildLogConnector(() => {}).tool;

  const inputs = buildSeedInputs(config, {
    definitions: [],
    actions: { logConnector: { tool }, queuedTools: [] },
    taskBounds: buildMockTaskStartBounds(),
  });

  const prompts = { compaction: { parts: { safety: 'Quote the owner.' }, template: null } };

  const snapshot = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    tasks: [],
    persona: '# P\n',
    policy: inputs.buildPolicy(prompts),
    prompts,
  });

  expect(snapshot.policyHash).toBe(
    '5992c8fb7f4cdcd0cf11bb468fde07ca8e2871cfb383164cd40f509b5d9c5673',
  );
});

test('it lets a file definition list a registered tool that a definition from chat cannot', () => {
  const config = {
    definitions: { source: { kind: 'path', path: '/srv/definitions' }, probeIntervalMs: 300_000 },
    models: buildTestModelsConfig({ modelURL: 'https://models.example.test' }),
    owner: { name: 'Marisol', pronouns: { they: 'she', their: 'her' } },
  } as const;

  const tool = buildLogConnector(() => {}).tool;

  const inputs = buildSeedInputs(config, {
    definitions: [],
    actions: { logConnector: { tool }, queuedTools: [] },
    taskBounds: buildMockTaskStartBounds(),
  });

  const input = { name: 'Log a note', brief: 'Write one line.', tools: ['actions.log'] };

  expect(inputs.tasks.toolNames).toStrictEqual(['actions.log']);
  expect(inputs.tasks.checkTaskStart(input, 'file')).toStrictEqual({ status: 'planned' });
  expect(inputs.tasks.checkTaskStart(input, 'conversation').status).toBe('refused');
});

test('it lists a configured MCP server as one task tool entry, and no conversation tool holds it', () => {
  const config = {
    definitions: { source: { kind: 'path', path: '/srv/definitions' }, probeIntervalMs: 300_000 },
    models: buildTestModelsConfig({ modelURL: 'https://models.example.test' }),
    owner: { name: 'Marisol', pronouns: { they: 'she', their: 'her' } },
    mcp: mcpConfigSchema.parse({
      servers: {
        tracker: { url: 'https://tracker.example.org/mcp', clientID: 'a', scope: 'read' },
      },
    }),
  } as const;

  const tool = buildLogConnector(() => {}).tool;

  const inputs = buildSeedInputs(config, {
    definitions: [],
    actions: { logConnector: { tool }, queuedTools: [] },
    taskBounds: buildMockTaskStartBounds(),
  });

  expect(inputs.tasks.toolNames).toStrictEqual(['tracker.*', 'actions.log']);
});

test.each([
  ['the whole server', 'tracker.*'],
  ['one tool of the server', 'tracker.item_get'],
])(
  'it plans the start of a task from chat that names %s of a configured MCP server',
  (_case, entry) => {
    const config = {
      definitions: { source: { kind: 'path', path: '/srv/definitions' }, probeIntervalMs: 300_000 },
      models: buildTestModelsConfig({ modelURL: 'https://models.example.test' }),
      owner: { name: 'Marisol', pronouns: { they: 'she', their: 'her' } },
      mcp: mcpConfigSchema.parse({
        servers: {
          tracker: { url: 'https://tracker.example.org/mcp', clientID: 'a', scope: 'read' },
        },
      }),
    } as const;

    const tool = buildLogConnector(() => {}).tool;

    const inputs = buildSeedInputs(config, {
      definitions: [],
      actions: { logConnector: { tool }, queuedTools: [] },
      taskBounds: buildMockTaskStartBounds(),
    });

    const checked = inputs.tasks.checkTaskStart(
      { name: 'Check the rain gauge', brief: 'Read the gauge.', tools: [entry] },
      'conversation',
    );

    expect(checked).toStrictEqual({ status: 'planned' });
  },
);
