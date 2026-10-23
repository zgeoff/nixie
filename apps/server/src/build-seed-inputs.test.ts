import { expect, test } from 'bun:test';
import { buildDefinitionsSnapshot } from '@heynixie/definitions';
import type { ToolDefinition } from '@heynixie/tools';
import { buildLogConnector } from './build-log-connector';
import { buildSeedInputs } from './build-seed-inputs';

test("it puts the queue check's tool declaration in the policy, beside the conversation's tools", () => {
  const config = {
    definitions: { source: { kind: 'path', path: '/srv/definitions' }, probeIntervalMs: 300_000 },
    owner: { name: 'Marisol', pronouns: { they: 'she', their: 'her' } },
  } as const;

  const tool = buildLogConnector(() => {}).tool;
  const inputs = buildSeedInputs(config, { definitions: [], actions: { logConnector: { tool } } });

  expect(inputs.policy.tools).toStrictEqual([
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
  ['Marisol', '5d854941871f9a0ab10867619a008bf5afd88441f92ac97480e722ea834b0a78'],
  [null, 'bbf90077250e90bddcdd0b69c8207e84e03d69c16d087574d52041a4cf9ffc70'],
])(
  'it builds the pinned policy hash from the built-in checker prompts for the owner name %s',
  (name, policyHash) => {
    const config = {
      definitions: { source: { kind: 'path', path: '/srv/d' }, probeIntervalMs: 300_000 },
      owner: { name, pronouns: { they: 'she', their: 'her' } },
    } as const;

    const tool = buildLogConnector(() => {}).tool;

    const snapshot = buildDefinitionsSnapshot({
      skills: [],
      conversationSkills: [],
      persona: '# P\n',
      policy: buildSeedInputs(config, { definitions: [], actions: { logConnector: { tool } } })
        .policy,
    });

    expect(snapshot.policyHash).toBe(policyHash);
  },
);

test("it changes the snapshot hash when the queue check's tool declaration changes", () => {
  const config = {
    definitions: { source: { kind: 'path', path: '/srv/definitions' }, probeIntervalMs: 300_000 },
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
        }).policy,
      }).snapshotHash,
  );

  expect(hashes[0]).not.toBe(hashes[1]);
});
