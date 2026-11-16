import { expect, test } from 'bun:test';
import { buildDefinitionsSnapshot } from '@heynixie/definitions';
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
    actions: { logConnector: { tool } },
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

test.each([
  ['Marisol', 'fd8e0ff7d42741ec02559311ce15fa2ad93c2334c2af4a6d85b41beb2ce0cb52'],
  [null, '8484864dd6b00031bf2c1ee3c2bd1005016c52bf7d7363b4e4b7cdac9cfd7cd5'],
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
        actions: { logConnector: { tool } },
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
          actions: { logConnector: { tool: logTool } },
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
    actions: { logConnector: { tool } },
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
    'fd8e0ff7d42741ec02559311ce15fa2ad93c2334c2af4a6d85b41beb2ce0cb52',
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
    actions: { logConnector: { tool } },
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
    'fd8e0ff7d42741ec02559311ce15fa2ad93c2334c2af4a6d85b41beb2ce0cb52',
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
    actions: { logConnector: { tool } },
    taskBounds: buildMockTaskStartBounds(),
  });

  const input = { name: 'Log a note', brief: 'Write one line.', tools: ['actions.log'] };

  expect(inputs.tasks.toolNames).toStrictEqual(['actions.log']);
  expect(inputs.tasks.checkTaskStart(input, 'file')).toStrictEqual({ status: 'planned' });
  expect(inputs.tasks.checkTaskStart(input, 'conversation').status).toBe('refused');
});
