import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPolicyCall } from './test-utils/build-policy-call';
import { buildRuleEntry } from './test-utils/build-rule-entry';
import {
  buildTestDecisionPoint,
  buildTestDeclaration,
  buildTypedMessage,
} from './test-utils/build-test-decision-point';

test('it denies an unknown tool at the registry stage', async () => {
  const ctx = buildTestDecisionPoint({ declaration: null });

  const decided = await ctx.decide(buildPolicyCall({ tool: 'nope', toolList: ['nope'] }));

  expect(decided).toStrictEqual({
    decision: { outcome: 'deny', stage: 1, rule: null, destinations: [], snapshot: 'snapshot-1' },
    sentence: 'The tool nope is unknown or has no effect declaration.',
  });
});

test('it denies a tool that declares no effect at the registry stage', async () => {
  const ctx = buildTestDecisionPoint({ declaration: buildTestDeclaration({ effects: [] }) });

  const decided = await ctx.decide(buildPolicyCall({ tool: 'bare', toolList: ['bare'] }));

  expect(decided.sentence).toBe('The tool bare is unknown or has no effect declaration.');
});

test("it denies a tool outside the caller's tool list at the scope stage", async () => {
  const ctx = buildTestDecisionPoint();

  const decided = await ctx.decide(buildPolicyCall({ tool: 'mail.send', toolList: ['other'] }));

  expect(decided).toStrictEqual({
    decision: { outcome: 'deny', stage: 2, rule: null, destinations: [], snapshot: 'snapshot-1' },
    sentence: "The tool mail.send is not on this run's tool list.",
  });
});

test('it prefers the declaration in the snapshot to the one in code', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['read'] }),
    inputs: { tools: new Map([['mail.send', buildTestDeclaration({ effects: ['spend'] })]]) },
  });

  const decided = await ctx.decide(buildPolicyCall());

  expect(decided.decision.cause).toBe('always_ask');
});

test('it denies at stage 3 with the rule sentence when a deny rule matches', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['send', 'spend'] }),
    rules: [
      buildRuleEntry('deny-sends', { outcome: 'deny', effects: ['send'] }),
      buildRuleEntry('ask-sends', { outcome: 'ask', effects: ['send'] }),
      buildRuleEntry('allow-sends', { outcome: 'allow', effects: ['send', 'spend'] }),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({ destinations: [{ value: 'sam@example.org', replyTarget: false }] }),
  );

  expect(decided).toStrictEqual({
    decision: {
      outcome: 'deny',
      stage: 3,
      rule: { id: 'deny-sends', revision: 2, others: [] },
      destinations: [{ value: 'sam@example.org', permission: null }],
      snapshot: 'snapshot-1',
    },
    sentence:
      'Not allowed by rule `deny-sends` (r2): **Deny** a call when it has the effect `send`.',
  });
});

test('it asks at stage 4 for a tool that spends, whatever the rules allow', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['spend'], destinations: [] }),
    rules: [
      buildRuleEntry('ask-spend', { outcome: 'ask', effects: ['spend'] }),
      buildRuleEntry('allow-spend', { outcome: 'allow', effects: ['spend'] }),
    ],
  });

  const decided = await ctx.decide(buildPolicyCall());

  expect(decided.decision).toStrictEqual({
    outcome: 'ask',
    stage: 4,
    rule: null,
    cause: 'always_ask',
    destinations: [],
    snapshot: 'snapshot-1',
  });
});

test.each(['policy_widen', 'budget_raise'] as const)(
  'it asks at stage 4 for the effect %s',
  async (effect) => {
    const ctx = buildTestDecisionPoint({
      declaration: buildTestDeclaration({ effects: [effect], destinations: [] }),
    });

    const decided = await ctx.decide(buildPolicyCall());

    expect(decided.decision.stage).toBe(4);
  },
);

test('it asks at stage 5 for a destination with no permission, past an ask and an allow rule', async () => {
  const ctx = buildTestDecisionPoint({
    rules: [
      buildRuleEntry('ask-sends', { outcome: 'ask', effects: ['send'] }),
      buildRuleEntry('allow-sends', { outcome: 'allow', effects: ['send'] }),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({ destinations: [{ value: 'sam@example.org', replyTarget: false }] }),
  );

  expect(decided.decision).toStrictEqual({
    outcome: 'ask',
    stage: 5,
    rule: null,
    cause: 'outside_steering',
    destinations: [{ value: 'sam@example.org', permission: null }],
    snapshot: 'snapshot-1',
  });
});

test('it passes stage 5 for a reply target and lets an ask rule decide at stage 6', async () => {
  const ctx = buildTestDecisionPoint({
    rules: [
      buildRuleEntry('ask-sends', { outcome: 'ask', effects: ['send'] }),
      buildRuleEntry('allow-sends', { outcome: 'allow', effects: ['send'] }),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({ destinations: [{ value: 'sam@example.org', replyTarget: true }] }),
  );

  expect(decided.decision).toStrictEqual({
    outcome: 'ask',
    stage: 6,
    rule: { id: 'ask-sends', revision: 2, others: [] },
    cause: 'ask_rule',
    destinations: [{ value: 'sam@example.org', permission: 'reply_target' }],
    snapshot: 'snapshot-1',
  });
});

test('it allows at stage 7 with the allow rule when no ask rule matches', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['read'], destinations: [] }),
    rules: [buildRuleEntry('allow-reads', { outcome: 'allow', effects: ['read'] })],
  });

  const decided = await ctx.decide(buildPolicyCall());

  expect(decided).toStrictEqual({
    decision: {
      outcome: 'allow',
      stage: 7,
      rule: { id: 'allow-reads', revision: 2, others: [] },
      destinations: [],
      snapshot: 'snapshot-1',
    },
    sentence: null,
  });
});

test('it allows at stage 8 when the owner asked for the call in typed words and no rule matches', async () => {
  const ctx = buildTestDecisionPoint({
    messages: [buildTypedMessage(7, 'Send Sam the report at sam@example.org', 1_794_550_000_000)],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      destinations: [{ value: 'sam@example.org', replyTarget: false }],
      turnMessageSequence: 7,
    }),
  );

  expect(decided.decision).toStrictEqual({
    outcome: 'allow',
    stage: 8,
    rule: null,
    destinations: [{ value: 'sam@example.org', permission: null }],
    consent: { messageSequences: [7], codeCheck: 'pass', checker: 'yes' },
    snapshot: 'snapshot-1',
  });
});

test('it asks at stage 9 when no rule matches and the owner did not ask', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['write'], destinations: [] }),
  });

  const decided = await ctx.decide(buildPolicyCall());

  expect(decided.decision).toStrictEqual({
    outcome: 'ask',
    stage: 9,
    rule: null,
    cause: 'no_rule',
    destinations: [],
    snapshot: 'snapshot-1',
  });
});

test('it marks an ask at stage 9 a direct request when the checker did not agree after the code check passed', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['write'], destinations: [] }),
    messages: [buildTypedMessage(7, 'Tidy my notes', 1_794_550_000_000)],
    answer: { verdict: 'unsure', failure: null },
  });

  const decided = await ctx.decide(buildPolicyCall({ turnMessageSequence: 7 }));

  expect(decided.decision).toStrictEqual({
    outcome: 'ask',
    stage: 9,
    rule: null,
    cause: 'no_rule',
    defect: 'direct_request',
    destinations: [],
    consent: { messageSequences: [7], codeCheck: 'pass', checker: 'unsure' },
    snapshot: 'snapshot-1',
  });
});

test('it names the other matching rules beside the one that decided', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['read'], destinations: [] }),
    rules: [
      buildRuleEntry('b-reads', { outcome: 'allow', effects: ['read'] }),
      buildRuleEntry('a-reads', { outcome: 'allow', effects: ['read'] }),
    ],
  });

  const decided = await ctx.decide(buildPolicyCall());

  expect(decided.decision.rule).toStrictEqual({ id: 'a-reads', revision: 2, others: ['b-reads'] });
});

test('it grants a destination the rule permission without letting the rule decide at stage 5', async () => {
  const ctx = buildTestDecisionPoint({
    rules: [
      buildRuleEntry('allow-example', {
        outcome: 'allow',
        effects: ['send'],
        destinations: ['*@example.org'],
      }),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({ destinations: [{ value: 'sam@example.org', replyTarget: false }] }),
  );

  expect(decided.decision).toMatchObject({
    outcome: 'allow',
    stage: 7,
    destinations: [{ value: 'sam@example.org', permission: 'rule' }],
  });
});

test('it grants a destination the job permission from the definition that runs the call', async () => {
  const ctx = buildTestDecisionPoint({
    jobDestinations: ['*@example.org'],
    rules: [buildRuleEntry('allow-sends', { outcome: 'allow', effects: ['send'] })],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      destinations: [{ value: 'sam@example.org', replyTarget: false }],
      definitionID: 'weekly',
    }),
  );

  expect(decided.decision.destinations).toStrictEqual([
    { value: 'sam@example.org', permission: 'job' },
  ]);
});

test('it grants no job permission to a call with no definition', async () => {
  const ctx = buildTestDecisionPoint({
    jobDestinations: ['*@example.org'],
    rules: [buildRuleEntry('allow-sends', { outcome: 'allow', effects: ['send'] })],
  });

  const decided = await ctx.decide(
    buildPolicyCall({ destinations: [{ value: 'sam@example.org', replyTarget: false }] }),
  );

  expect(decided.decision.stage).toBe(5);
});

test('it grants a known contact permission to its destination', async () => {
  const ctx = buildTestDecisionPoint({
    inputs: { contacts: [{ contactID: 'c1', name: 'Sam', destination: 'sam@example.org' }] },
    rules: [buildRuleEntry('allow-sends', { outcome: 'allow', effects: ['send'] })],
  });

  const decided = await ctx.decide(
    buildPolicyCall({ destinations: [{ value: 'sam@example.org', replyTarget: false }] }),
  );

  expect(decided.decision.destinations).toStrictEqual([
    { value: 'sam@example.org', permission: 'known_contact' },
  ]);
});

test('it gives a contact with erased details no permission', async () => {
  const ctx = buildTestDecisionPoint({
    inputs: { contacts: [{ contactID: 'c1', name: null, destination: null }] },
    rules: [buildRuleEntry('allow-sends', { outcome: 'allow', effects: ['send'] })],
  });

  const decided = await ctx.decide(
    buildPolicyCall({ destinations: [{ value: 'sam@example.org', replyTarget: false }] }),
  );

  expect(decided.decision.stage).toBe(5);
});

test('it allows actions.log through the queue check rule, and test.send through the test rule', async () => {
  const ctx = buildTestDecisionPoint({ declaration: buildTestDeclaration({ destinations: [] }) });

  const log = await ctx.decide(buildPolicyCall({ tool: 'actions.log', toolList: ['actions.log'] }));
  const send = await ctx.decide(buildPolicyCall({ tool: 'test.send', toolList: ['test.send'] }));

  expect([log.decision.rule, send.decision.rule]).toStrictEqual([
    { id: 'slice1.queue-check', revision: 1, others: [] },
    { id: 'test.allow-send', revision: 1, others: [] },
  ]);
});

test('it lets a deny rule of the owner stop actions.log', async () => {
  const ctx = buildTestDecisionPoint({
    rules: [buildRuleEntry('deny-log', { outcome: 'deny', tools: ['actions.log'] })],
  });

  const decided = await ctx.decide(
    buildPolicyCall({ tool: 'actions.log', toolList: ['actions.log'] }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'deny', stage: 3 });
});

test('it asks about test.send and allows actions.log in the release bundle, which holds no test rule', async () => {
  const outdir = await mkdtemp(join(tmpdir(), 'nixie-policy-bundle-'));

  onTestFinished(() => rm(outdir, { recursive: true, force: true }));

  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, 'index.ts')],
    outdir,
    target: 'bun',
    naming: 'policy.js',
    define: { NIXIE_TEST_BUILD: 'false' },
  });

  await writeFile(
    join(outdir, 'decide.js'),
    [
      "import { makeDecisionPoint } from './policy.js';",
      'const declaration = { effects: ["write"], destinations: [], amount: null, content: [], results: {} };',
      'const decide = makeDecisionPoint({',
      '  findDeclaration: () => declaration,',
      '  readInputs: async () => ({ rules: [], contacts: [], tools: new Map(), ownerDestinations: [] }),',
      '  findJobDestinations: () => [],',
      '  readConsent: async () => null,',
      '});',
      'const base = { context: "task", definitionID: null, args: {}, destinations: [], sources: [], at: 1, turnMessageSequence: null, onBehalfOf: [], snapshot: "s" };',
      'const send = (await decide({ ...base, tool: "test.send", toolList: ["test.send"] })).decision;',
      'const log = (await decide({ ...base, tool: "actions.log", toolList: ["actions.log"] })).decision;',
      'console.log(JSON.stringify([send.outcome + send.stage, log.outcome + log.stage]));',
    ].join('\n'),
  );

  const decided = Bun.spawnSync([process.execPath, join(outdir, 'decide.js')]);

  const bundle = await Bun.file(join(outdir, 'policy.js')).text();

  expect(result.success).toBeTrue();
  expect(JSON.parse(decided.stdout.toString())).toStrictEqual(['ask9', 'allow7']);
  expect(bundle).not.toInclude('test.allow-send');
});
