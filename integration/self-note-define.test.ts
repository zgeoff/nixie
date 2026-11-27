import { expect, test } from 'bun:test';
import { buildTaskDefineTool } from '@heynixie/definitions';
import { buildTestDefineInput, startTestDefinitions } from '@heynixie/definitions/test-utils';
import { parseJSONObject } from '@heynixie/log';
import type { Effect, PolicyCall, Rule } from '@heynixie/policy';
import { makeDecisionPoint } from '@heynixie/policy';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';

interface SetupConfig {
  readonly rules?: readonly Rule[];

  // the effects that the snapshot in force declares for task.define, which the decision point reads
  // before the declaration in code
  readonly snapshotEffects?: readonly Effect[];
}

async function setupTest(config: SetupConfig = {}) {
  const ctx = await startTestDefinitions();

  await ctx.seed();

  const tool = buildTaskDefineTool({
    readDefinitions: () => ctx.context,
    readZone: () => Promise.resolve('UTC'),
  });

  invariant(tool.prepare, 'task.define prepares its call');

  const prepare = tool.prepare;

  // an owner allow rule for every call of the schedule effect, which a plain define falls under
  const rules = [
    { id: 'allow-schedule', outcome: 'allow', effects: ['schedule'] } satisfies Rule,
    ...(config.rules ?? []),
  ];

  const snapshotEffects = config.snapshotEffects;

  const decide = makeDecisionPoint({
    findDeclaration: (name) => (name === 'task.define' ? tool.declaration : null),
    readInputs: () =>
      Promise.resolve({
        rules: rules.map((rule) => ({ id: rule.id, revision: 1, rule })),
        places: [],
        tools:
          snapshotEffects === undefined
            ? new Map()
            : new Map([['task.define', { ...tool.declaration, effects: snapshotEffects }]]),
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

test('it denies a define that sets self notes under a deny rule on an effect the snapshot declares for the tool', async () => {
  const ctx = await setupTest({
    rules: [{ id: 'deny-send', outcome: 'deny', effects: ['send'] }],
    snapshotEffects: ['schedule', 'send'],
  });

  const granting = await ctx.decideDefine(buildTestDefineInput({ memory: 'self_notes' }));

  expect([granting.decision.outcome, granting.decision.stage]).toStrictEqual(['deny', 3]);
});

test('it denies a define that sets self notes under a deny rule on schedule', async () => {
  const ctx = await setupTest({
    rules: [{ id: 'deny-schedule', outcome: 'deny', effects: ['schedule'] }],
  });

  const granting = await ctx.decideDefine(buildTestDefineInput({ memory: 'self_notes' }));

  expect([granting.decision.outcome, granting.decision.stage]).toStrictEqual(['deny', 3]);
});
