import { expect, test } from 'bun:test';
import { buildDefinitionsSnapshot } from '@heynixie/definitions';
import type { ToolDefinition } from '@heynixie/tools';
import { buildLogConnector } from './build-log-connector';
import { buildSeedInputs } from './build-seed-inputs';

const config = {
  definitions: { source: { kind: 'path', path: '/srv/definitions' }, probeIntervalMs: 300_000 },
  owner: { name: 'Marisol', pronouns: { they: 'she', their: 'her' } },
} as const;

test("it puts the queue check's tool declaration in the policy, beside the conversation's tools", () => {
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

test("it changes the snapshot hash when the queue check's tool declaration changes", () => {
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
