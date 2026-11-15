import { expect, test } from 'bun:test';
import { buildDefinitionsSnapshot } from '@heynixie/definitions';
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
  const inputs = buildSeedInputs(config, { definitions: [], actions: { logConnector: { tool } } });

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
  ['Marisol', 'e3af2006ee4ab4fcfbdddc533ea429a23d2f65f0df4826ae4743e3c74f6acb37'],
  [null, '3dcc45ea0af0debfd45121ffcffbd7287eea63df121e06bf72bd201da05205b7'],
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
      persona: '# P\n',
      policy: buildSeedInputs(config, {
        definitions: [],
        actions: { logConnector: { tool } },
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
        persona: '# Persona\n',
        policy: buildSeedInputs(config, {
          definitions: [],
          actions: { logConnector: { tool: logTool } },
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
  const inputs = buildSeedInputs(config, { definitions: [], actions: { logConnector: { tool } } });

  const snapshot = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: '# P\n',
    policy: inputs.buildPolicy(prompts),
    prompts,
  });

  expect(snapshot.policyHash).not.toBe(
    'e3af2006ee4ab4fcfbdddc533ea429a23d2f65f0df4826ae4743e3c74f6acb37',
  );
});

test('it keeps the policy hash when only a prompt other than the checkers has an override', () => {
  const config = {
    definitions: { source: { kind: 'path', path: '/srv/d' }, probeIntervalMs: 300_000 },
    models: buildTestModelsConfig({ modelURL: 'https://models.example.test' }),
    owner: { name: 'Marisol', pronouns: { they: 'she', their: 'her' } },
  } as const;

  const tool = buildLogConnector(() => {}).tool;
  const inputs = buildSeedInputs(config, { definitions: [], actions: { logConnector: { tool } } });
  const prompts = { compaction: { parts: { safety: 'Quote the owner.' }, template: null } };

  const snapshot = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: '# P\n',
    policy: inputs.buildPolicy(prompts),
    prompts,
  });

  expect(snapshot.policyHash).toBe(
    'e3af2006ee4ab4fcfbdddc533ea429a23d2f65f0df4826ae4743e3c74f6acb37',
  );
});
