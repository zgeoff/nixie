import { expect, test } from 'bun:test';
import { buildTaskDefineTool, readDefinitionVersion } from '@heynixie/definitions';
import {
  buildTestDefineInput,
  readTestRuntimeTasks,
  startTestDefinitions,
} from '@heynixie/definitions/test-utils';
import { parseJSONObject } from '@heynixie/log';
import type { PolicyCall } from '@heynixie/policy';
import { makeDecisionPoint } from '@heynixie/policy';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';

async function setupTest() {
  const ctx = await startTestDefinitions();

  await ctx.seed();

  const tool = buildTaskDefineTool({
    readDefinitions: () => ctx.context,
    readZone: () => Promise.resolve('UTC'),
  });

  invariant(tool.prepare, 'task.define prepares its call');

  const prepare = tool.prepare;

  // an owner allow rule for every call of the schedule effect, which a plain define falls under
  const decide = makeDecisionPoint({
    findDeclaration: (name) => (name === 'task.define' ? tool.declaration : null),
    readInputs: () =>
      Promise.resolve({
        rules: [
          {
            id: 'allow-schedule',
            revision: 1,
            rule: { id: 'allow-schedule', outcome: 'allow', effects: ['schedule'] },
          },
        ],
        contacts: [],
        tools: new Map(),
        ownerDestinations: [],
      }),
    findTaskDestinations: () => [],
    readConsent: () => Promise.resolve(null),
  });

  return {
    ...ctx,
    tool,
    decideDefine: async (input: object) => {
      const json = parseJSONObject(JSON.stringify(input));

      const prepared = await prepare(json, buildMockToolContext());

      invariant('destinations' in prepared, 'the prepare reads no result of its own');

      const call: PolicyCall = {
        tool: 'task.define',
        toolList: ['task.define'],
        context: 'conversation',
        definitionID: null,
        args: json,
        destinations: [],
        sources: ['owner'],
        at: ctx.clock.now(),
        turnMessageSequence: null,
        onBehalfOf: [],
        snapshot: 'sha256:test',
        ...(prepared.effects === undefined ? {} : { effects: prepared.effects }),
      };

      return decide(call);
    },
  };
}

test('it asks before a define that sets self notes applies, though an allow rule covers a plain define', async () => {
  const ctx = await setupTest();
  const plain = await ctx.decideDefine(buildTestDefineInput({}));
  const granting = await ctx.decideDefine(buildTestDefineInput({ memory: 'self_notes' }));

  expect([
    [plain.decision.outcome, plain.decision.cause],
    [granting.decision.outcome, granting.decision.cause],
  ]).toStrictEqual([
    ['allow', undefined],
    ['ask', 'always_ask'],
  ]);
});

test('it puts a definition with the self-note grant in force, and reads the grant back from its stored version', async () => {
  const ctx = await setupTest();

  const input = parseJSONObject(
    JSON.stringify(buildTestDefineInput({ name: 'Tidy the notes', memory: 'self_notes' })),
  );

  const outcome = await ctx.tool.run(
    buildMockToolCall({ tool: 'task.define', input }),
    buildMockToolContext(),
  );

  const rows = await readTestRuntimeTasks(ctx.writer);

  const hash = rows.find((row) => row.definition_hash !== null)?.definition_hash;

  invariant(hash, 'the define stored a version');

  const version = await readDefinitionVersion(ctx.writer.db, hash);

  expect([outcome.status, version?.memory]).toStrictEqual(['ok', 'self_notes']);
});
