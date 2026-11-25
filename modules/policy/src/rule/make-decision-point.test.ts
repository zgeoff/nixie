import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrationsPlugin } from '@heynixie/db';
import { buildPolicyCall } from '../test-utils/build-policy-call';
import { buildRuleEntry } from '../test-utils/build-rule-entry';
import {
  buildTestDecisionPoint,
  buildTestDeclaration,
  buildTypedMessage,
} from '../test-utils/build-test-decision-point';

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

test('it takes a tool variant as on the tool list when its tool is', async () => {
  const ctx = buildTestDecisionPoint();

  const decided = await ctx.decide(
    buildPolicyCall({ tool: 'task.start/atc', toolList: ['task.start'] }),
  );

  expect(decided.decision.stage).toBeGreaterThan(2);
});

test('it denies a tool variant at the scope stage when its tool is not on the list', async () => {
  const ctx = buildTestDecisionPoint();

  const decided = await ctx.decide(
    buildPolicyCall({ tool: 'task.start/atc', toolList: ['task.message'] }),
  );

  expect(decided.sentence).toBe("The tool task.start/atc is not on this run's tool list.");
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

test('it passes stage 4 for a purchase within the lift, and carries the lift', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({
      effects: ['spend'],
      destinations: ['merchant'],
      amount: 'order.total',
    }),
    rules: [
      buildRuleEntry('allow-groceries', {
        outcome: 'allow',
        tools: ['shop.order'],
        destinations: ['orders@grocer.example'],
        lift: { perAction: 20, budget: 'shopping-month' },
      }),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      tool: 'shop.order',
      toolList: ['shop.order'],
      args: { order: { total: 12.5 } },
      destinations: [{ value: 'orders@grocer.example', replyTarget: false }],
    }),
  );

  expect(decided.decision).toStrictEqual({
    outcome: 'allow',
    stage: 7,
    rule: { id: 'allow-groceries', revision: 2, others: [] },
    destinations: [{ value: 'orders@grocer.example', permission: 'rule' }],
    snapshot: 'snapshot-1',
    lift: { ruleID: 'allow-groceries', budgetID: 'shopping-month', amountMicros: 12_500_000 },
  });
});

test('it asks at stage 4 for a purchase over the cap of the lift', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({
      effects: ['spend'],
      destinations: ['merchant'],
      amount: 'order.total',
    }),
    rules: [
      buildRuleEntry('allow-groceries', {
        outcome: 'allow',
        tools: ['shop.order'],
        destinations: ['orders@grocer.example'],
        lift: { perAction: 20, budget: 'shopping-month' },
      }),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      tool: 'shop.order',
      toolList: ['shop.order'],
      args: { order: { total: 20.01 } },
      destinations: [{ value: 'orders@grocer.example', replyTarget: false }],
    }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'ask', stage: 4, cause: 'always_ask' });
});

test('it asks at stage 4 for a purchase whose amount the declaration does not name', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['spend'], destinations: ['merchant'] }),
    rules: [
      buildRuleEntry('allow-groceries', {
        outcome: 'allow',
        tools: ['shop.order'],
        lift: { perAction: 20, budget: 'shopping-month' },
      }),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      tool: 'shop.order',
      toolList: ['shop.order'],
      args: { order: { total: 5 } },
      destinations: [{ value: 'orders@grocer.example', replyTarget: false }],
    }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'ask', stage: 4 });
});

test('it asks at stage 4 for a spend call with another always-ask effect', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({
      effects: ['spend', 'policy_widen'],
      destinations: ['merchant'],
      amount: 'order.total',
    }),
    rules: [
      buildRuleEntry('allow-groceries', {
        outcome: 'allow',
        tools: ['shop.order'],
        lift: { perAction: 20, budget: 'shopping-month' },
      }),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      tool: 'shop.order',
      toolList: ['shop.order'],
      args: { order: { total: 5 } },
      destinations: [{ value: 'orders@grocer.example', replyTarget: false }],
    }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'ask', stage: 4 });
});

test('it asks at stage 4 when the lifting rule does not match the call', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({
      effects: ['spend'],
      destinations: ['merchant'],
      amount: 'order.total',
    }),
    rules: [
      buildRuleEntry('allow-refunds', {
        outcome: 'allow',
        tools: ['shop.refund'],
        lift: { perAction: 20, budget: 'shopping-month' },
      }),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      tool: 'shop.order',
      toolList: ['shop.order'],
      args: { order: { total: 5 } },
      destinations: [{ value: 'orders@grocer.example', replyTarget: false }],
    }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'ask', stage: 4 });
});

test('it refuses a lifted purchase at stage 5 when a destination has no permission', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({
      effects: ['spend'],
      destinations: ['merchant'],
      amount: 'order.total',
    }),
    rules: [
      buildRuleEntry('allow-orders', {
        outcome: 'allow',
        tools: ['shop.order'],
        lift: { perAction: 20, budget: 'shopping-month' },
      }),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      tool: 'shop.order',
      toolList: ['shop.order'],
      args: { order: { total: 5 } },
      destinations: [{ value: 'orders@stranger.example', replyTarget: false }],
    }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'ask', stage: 5, cause: 'outside_steering' });
});

test('it keeps asking at stage 4 for a purchase when the allow rule holds no lift', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({
      effects: ['spend'],
      destinations: ['merchant'],
      amount: 'order.total',
    }),
    rules: [buildRuleEntry('allow-groceries', { outcome: 'allow', tools: ['shop.order'] })],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      tool: 'shop.order',
      toolList: ['shop.order'],
      args: { order: { total: 5 } },
      destinations: [{ value: 'orders@grocer.example', replyTarget: false }],
    }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'ask', stage: 4 });
});

test('it asks at stage 6 for a lifted purchase that an ask rule matches', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({
      effects: ['spend'],
      destinations: ['merchant'],
      amount: 'order.total',
    }),
    rules: [
      buildRuleEntry('allow-groceries', {
        outcome: 'allow',
        tools: ['shop.order'],
        destinations: ['orders@grocer.example'],
        lift: { perAction: 20, budget: 'shopping-month' },
      }),
      buildRuleEntry('ask-orders', { outcome: 'ask', tools: ['shop.order'] }),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      tool: 'shop.order',
      toolList: ['shop.order'],
      args: { order: { total: 5 } },
      destinations: [{ value: 'orders@grocer.example', replyTarget: false }],
    }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'ask', stage: 6 });
});

test.each(['policy_widen', 'budget_raise', 'install_package'] as const)(
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
        destinations: ['sam@example.org'],
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

test('it grants a destination the task permission from the definition that runs the call', async () => {
  const ctx = buildTestDecisionPoint({
    taskDestinations: ['sam@example.org'],
    rules: [buildRuleEntry('allow-sends', { outcome: 'allow', effects: ['send'] })],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      destinations: [{ value: 'sam@example.org', replyTarget: false }],
      definitionID: 'weekly',
    }),
  );

  expect(decided.decision.destinations).toStrictEqual([
    { value: 'sam@example.org', permission: 'task' },
  ]);
});

test('it grants no task permission to a call with no definition', async () => {
  const ctx = buildTestDecisionPoint({
    taskDestinations: ['sam@example.org'],
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
    entrypoints: [join(import.meta.dir, '..', 'index.ts')],
    outdir,
    target: 'bun',
    naming: 'policy.js',
    define: { NIXIE_TEST_BUILD: 'false' },
    plugins: [migrationsPlugin],
  });

  await writeFile(
    join(outdir, 'decide.js'),
    [
      "import { makeDecisionPoint } from './policy.js';",
      'const declaration = { effects: ["write"], destinations: [], amount: null, content: [], results: {} };',
      'const decide = makeDecisionPoint({',
      '  findDeclaration: () => declaration,',
      '  readInputs: async () => ({ rules: [], contacts: [], tools: new Map(), ownerDestinations: [] }),',
      '  findTaskDestinations: () => [],',
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

test('it asks for a moment.keep that an ask rule names, and lets the starter rules allow the same call', async () => {
  const asked = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['note'], destinations: [], content: ['title'] }),
    rules: [buildRuleEntry('ask-moments', { outcome: 'ask', tools: ['moment.keep'] })],
  });

  const allowed = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['note'], destinations: [], content: ['title'] }),
    rules: [buildRuleEntry('allow-notes', { outcome: 'allow', effects: ['note'] })],
  });

  const call = buildPolicyCall({
    tool: 'moment.keep',
    toolList: ['moment.keep'],
    args: { title: 'The ferry rule' },
  });

  const prompt = await asked.decide(call);
  const kept = await allowed.decide(call);

  expect([prompt.decision.outcome, prompt.decision.stage]).toStrictEqual(['ask', 6]);
  expect([kept.decision.outcome, kept.decision.stage]).toStrictEqual(['allow', 7]);
});

test('it meets stage 5 on a task call with a destination when the run read outside content from a moment', async () => {
  const ctx = buildTestDecisionPoint({
    rules: [buildRuleEntry('allow-sends', { outcome: 'allow', effects: ['send'] })],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      context: 'task',
      sources: ['own_data', 'outside'],
      destinations: [{ value: 'sam@example.org', replyTarget: false }],
    }),
  );

  expect([decided.decision.outcome, decided.decision.stage]).toStrictEqual(['ask', 5]);
});

test('it refuses a note whose destination is not word for word in the typed message', async () => {
  const ctx = buildTestDecisionPoint({
    messages: [buildTypedMessage(7, 'Tell Sam about the ferry', 1_794_550_000_000)],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      destinations: [{ value: 'sam@example.org', replyTarget: false }],
      turnMessageSequence: 7,
    }),
  );

  expect([decided.decision.outcome, decided.decision.stage]).toStrictEqual(['ask', 5]);
});

test('it gates a memory write at stage 8 when no rule decides it, and never reads consent', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['memory_write'], destinations: [] }),
    messages: [buildTypedMessage(7, 'Remember that I take tea', 1_794_550_000_000)],
    rules: [buildRuleEntry('allow-notes', { outcome: 'allow', effects: ['note'] })],
  });

  const decided = await ctx.decide(buildPolicyCall({ turnMessageSequence: 7 }));

  expect(decided).toStrictEqual({
    decision: { outcome: 'gate', stage: 8, rule: null, destinations: [], snapshot: 'snapshot-1' },
    sentence: null,
    memoryWrite: { allowing: [] },
  });

  expect(ctx.asked).toStrictEqual([]);
});

test('it allows a memory write at stage 7 and lists every allow rule that matched, by ID', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['memory_write'], destinations: [] }),
    rules: [
      buildRuleEntry('b-owner', { outcome: 'allow', effects: ['memory_write'] }),
      buildRuleEntry('a-self', {
        outcome: 'allow',
        effects: ['memory_write'],
        checks: [{ arg: 'subject', op: 'eq', value: 'self' }],
      }),
      buildRuleEntry('c-notes', { outcome: 'allow', effects: ['note'] }),
    ],
  });

  const decided = await ctx.decide(buildPolicyCall({ args: { subject: 'self' } }));

  expect(decided.decision).toStrictEqual({
    outcome: 'allow',
    stage: 7,
    rule: { id: 'a-self', revision: 2, others: ['b-owner'] },
    destinations: [],
    snapshot: 'snapshot-1',
  });

  expect(decided.memoryWrite).toStrictEqual({
    allowing: [
      { id: 'a-self', revision: 2, checks: [{ arg: 'subject', op: 'eq', value: 'self' }] },
      { id: 'b-owner', revision: 2, checks: [] },
    ],
  });
});

test('it asks at stage 6 for a memory write that an ask rule names', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['memory_write'], destinations: [] }),
    rules: [buildRuleEntry('ask-memory', { outcome: 'ask', effects: ['memory_write'] })],
  });

  const decided = await ctx.decide(buildPolicyCall());

  expect(decided.decision).toMatchObject({
    outcome: 'ask',
    stage: 6,
    cause: 'ask_rule',
    rule: { id: 'ask-memory' },
  });
});

test('it asks at stage 9 for a re-file that no rule decides, and never reads consent', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['memory_write'], destinations: [] }),
    messages: [buildTypedMessage(7, 'Move my lines topic to diary', 1_794_550_000_000)],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      tool: 'memory.retopic',
      toolList: ['memory.retopic'],
      turnMessageSequence: 7,
    }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'ask', stage: 9, cause: 'no_rule' });
  expect(decided.memoryWrite).toStrictEqual({ allowing: [], holdsAsAction: true });
  expect(ctx.asked).toStrictEqual([]);
});

test('it lets an allow rule that names memory.edit allow a re-file, and tells the tool which rule', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['memory_write'], destinations: [] }),
    rules: [buildRuleEntry('edits', { outcome: 'allow', tools: ['memory.edit'] })],
  });

  const decided = await ctx.decide(
    buildPolicyCall({ tool: 'memory.retopic', toolList: ['memory.retopic'] }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'allow', stage: 7, rule: { id: 'edits' } });
  expect(decided.namingRules).toStrictEqual([{ id: 'edits', revision: 2 }]);

  expect(decided.memoryWrite).toStrictEqual({
    allowing: [{ id: 'edits', revision: 2, checks: [] }],
    holdsAsAction: true,
  });
});

test.each([
  ['a self-note', 'self'],
  ['a move from self to another subject', ['owner', 'self']],
])(
  'it holds a re-file of %s that only an allow rule with no subject check allows',
  async (_name, subject) => {
    const ctx = buildTestDecisionPoint({
      declaration: buildTestDeclaration({ effects: ['memory_write'], destinations: [] }),
      rules: [buildRuleEntry('edits', { outcome: 'allow', tools: ['memory.edit'] })],
    });

    const decided = await ctx.decide(
      buildPolicyCall({
        tool: 'memory.retopic',
        toolList: ['memory.retopic'],
        args: { subject },
      }),
    );

    expect(decided.decision).toMatchObject({ outcome: 'ask', stage: 9, cause: 'no_rule' });
    expect(decided.memoryWrite).toStrictEqual({ allowing: [], holdsAsAction: true });
  },
);

test('it lets an allow rule that checks subject eq self allow a re-file into self', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['memory_write'], destinations: [] }),
    rules: [
      buildRuleEntry('self-edits', {
        outcome: 'allow',
        tools: ['memory.edit'],
        checks: [{ arg: 'subject', op: 'eq', value: 'self' }],
      }),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      tool: 'memory.retopic',
      toolList: ['memory.retopic'],
      args: { subject: 'self' },
    }),
  );

  expect(decided.decision).toMatchObject({
    outcome: 'allow',
    stage: 7,
    rule: { id: 'self-edits' },
  });
});

test('it does not let an allow rule that names memory.retopic cover memory.edit', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['memory_write'], destinations: [] }),
    rules: [buildRuleEntry('retopics', { outcome: 'allow', tools: ['memory.retopic'] })],
  });

  const decided = await ctx.decide(
    buildPolicyCall({ tool: 'memory.edit', toolList: ['memory.edit'] }),
  );

  expect(decided.decision.outcome).toBe('gate');
});

test('it holds a re-file that an ask rule on memory.edit names as an action proposal', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['memory_write'], destinations: [] }),
    rules: [buildRuleEntry('ask-edits', { outcome: 'ask', tools: ['memory.edit'] })],
  });

  const decided = await ctx.decide(
    buildPolicyCall({ tool: 'memory.retopic', toolList: ['memory.retopic'] }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'ask', stage: 6, cause: 'ask_rule' });
  expect(decided.memoryWrite).toMatchObject({ holdsAsAction: true });
});

test('it leaves a call that declares note to the rules on note when a rule asks about memory_write', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['note'], destinations: [] }),
    rules: [
      buildRuleEntry('ask-memory', { outcome: 'ask', effects: ['memory_write'] }),
      buildRuleEntry('allow-notes', { outcome: 'allow', effects: ['note'] }),
    ],
  });

  const decided = await ctx.decide(buildPolicyCall());

  expect([decided.decision.outcome, decided.decision.stage]).toStrictEqual(['allow', 7]);
  expect(decided.memoryWrite).toBeUndefined();
});

test('it allows a task.define at stage 8 when the owner asked for the schedule in typed words', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['schedule'], destinations: [] }),
    messages: [
      buildTypedMessage(7, 'Remind me to water the tomatoes every Friday', 1_794_550_000_000),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({ tool: 'task.define', toolList: ['task.define'], turnMessageSequence: 7 }),
  );

  expect(decided.decision).toStrictEqual({
    outcome: 'allow',
    stage: 8,
    rule: null,
    destinations: [],
    consent: { messageSequences: [7], codeCheck: 'pass', checker: 'yes' },
    snapshot: 'snapshot-1',
  });
});

test('it asks for a task.define at stage 9 when the owner did not ask for it', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['schedule'], destinations: [] }),
  });

  const decided = await ctx.decide(
    buildPolicyCall({ tool: 'task.define', toolList: ['task.define'] }),
  );

  expect(decided.decision).toStrictEqual({
    outcome: 'ask',
    stage: 9,
    rule: null,
    cause: 'no_rule',
    destinations: [],
    snapshot: 'snapshot-1',
  });
});

test('it lists each matched allow rule that names the tool exactly, and leaves out a rule on its effect alone', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['note'], destinations: [] }),
    rules: [
      buildRuleEntry('allow-notes', { outcome: 'allow', effects: ['note'] }),
      buildRuleEntry('allow-skill-writes', { outcome: 'allow', tools: ['skill_write'] }),
      buildRuleEntry('allow-skill-tools', { outcome: 'allow', tools: ['skill_*'] }),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({ tool: 'skill_write', toolList: ['skill_write'] }),
  );

  expect(decided.namingRules).toStrictEqual([{ id: 'allow-skill-writes', revision: 2 }]);
});

test('it lists no naming rule when only a rule on the note effect allows the call', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['note'], destinations: [] }),
    rules: [buildRuleEntry('allow-notes', { outcome: 'allow', effects: ['note'] })],
  });

  const decided = await ctx.decide(
    buildPolicyCall({ tool: 'skill_write', toolList: ['skill_write'] }),
  );

  expect([decided.decision.outcome, decided.namingRules]).toStrictEqual(['allow', undefined]);
});

test('it lists no naming rule when a deny rule refuses a call that an allow rule names', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['note'], destinations: [] }),
    rules: [
      buildRuleEntry('allow-skill-writes', { outcome: 'allow', tools: ['skill_write'] }),
      buildRuleEntry('deny-skill-writes', { outcome: 'deny', tools: ['skill_write'] }),
    ],
  });

  const decided = await ctx.decide(
    buildPolicyCall({ tool: 'skill_write', toolList: ['skill_write'] }),
  );

  expect([decided.decision.outcome, decided.namingRules]).toStrictEqual(['deny', undefined]);
});
