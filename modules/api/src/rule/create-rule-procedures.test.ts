import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPathSource, runInForceSeed, runSeed } from '@heynixie/definitions';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import { ORPCError } from '@orpc/client';
import { createRouterClient } from '@orpc/server';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { createRuleProcedures } from './create-rule-procedures';

async function setupTest() {
  const api = await startTestAPI();

  const root = join(api.dataDir, 'definitions');

  await mkdir(join(root, 'rules'), { recursive: true });
  await writeFile(join(root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(root, 'rules', 'mail.yaml'),
    [
      'allow-mail:',
      '  outcome: allow',
      '  tools: [mail.send]',
      '  destinations: [harbour@example.org, marina@example.org]',
      'allow-term-mail:',
      '  outcome: allow',
      '  tools: [mail.send]',
      '  destinations: [harbour@example.org, marina@example.org]',
      '  cel: now.getHours("Europe/London") < 17',
      '  note: Term mail goes out in the working day.',
      'deny-shell:',
      '  outcome: deny',
      '  tools: [shell.run]',
      '',
    ].join('\n'),
  );

  const log = api.context.log;

  await runSeed({
    tasks: buildTestTaskSeed(),
    log,
    source: createPathSource({ directory: root }),
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const laptop = await createDeviceSession(api.context, 'laptop');

  let seedGate = Promise.resolve();
  const seedStarted = Promise.withResolvers<void>();

  const procedures = createRuleProcedures({
    ...api.context,
    runInForceSeed: async () => {
      seedStarted.resolve();

      await seedGate;

      return runInForceSeed({ log, buildPolicy: () => ({ rules: [], tools: [] }) });
    },
  });

  return {
    // Holds every seed that a rule change starts, until the returned function runs.
    holdSeeds: () => {
      const gate = Promise.withResolvers<void>();

      seedGate = gate.promise;

      return gate.resolve;
    },
    waitForSeedStart: () => seedStarted.promise,

    // An error that the procedure throws in process holds the whole call's context, so a matcher
    // that walks it never ends. This keeps only what the contract shows.
    readRefusal: async (call: Promise<unknown>) => {
      const refusal = await call
        .then(() => null)
        .catch((error: unknown) => (error instanceof ORPCError ? error : null));

      if (refusal === null) {
        return null;
      }

      const code: unknown = refusal.code;
      const data: unknown = refusal.data;

      return { code, data };
    },
    client: createRouterClient(procedures, {
      context: { sessionToken: laptop.token, tokenSource: 'bearer' },
    }),
    signedOut: createRouterClient(procedures, {
      context: { sessionToken: undefined, tokenSource: 'none' },
    }),
  };
}

test('#readRule reads the rule in force with its sentence, outcome, destinations and revision', async () => {
  const ctx = await setupTest();
  const rule = await ctx.client.readRule({ ruleID: 'allow-mail' });

  expect(rule).toStrictEqual({
    ruleID: 'allow-mail',
    revision: 1,
    sentence: expect.toInclude('mail.send'),
    outcome: 'allow',
    destinations: ['harbour@example.org', 'marina@example.org'],
  });
});

test('#readRule refuses a rule that does not exist with NOT_FOUND', async () => {
  const ctx = await setupTest();
  const refusal = await ctx.readRefusal(ctx.client.readRule({ ruleID: 'no-such-rule' }));

  expect(refusal).toStrictEqual({
    code: 'NOT_FOUND',
    data: undefined,
  });
});

test('#readRule refuses a caller with no session with UNAUTHORIZED', async () => {
  const ctx = await setupTest();
  const refusal = await ctx.readRefusal(ctx.signedOut.readRule({ ruleID: 'allow-mail' }));

  expect(refusal).toStrictEqual({
    code: 'UNAUTHORIZED',
    data: undefined,
  });
});

test('#editRule drops a destination from a rule and moves its revision', async () => {
  const ctx = await setupTest();

  const edited = await ctx.client.editRule({
    ruleID: 'allow-mail',
    revision: 1,
    destinations: ['harbour@example.org'],
    clientActionID: crypto.randomUUID(),
  });

  const rule = await ctx.client.readRule({ ruleID: 'allow-mail' });

  expect({ edited, destinations: rule.destinations }).toStrictEqual({
    edited: { ruleID: 'allow-mail', revision: 2 },
    destinations: ['harbour@example.org'],
  });
});

test('#editRule refuses an edit that adds a destination as widening', async () => {
  const ctx = await setupTest();

  const edit = ctx.client.editRule({
    ruleID: 'allow-mail',
    revision: 1,
    destinations: ['harbour@example.org', 'marina@example.org', 'quay@example.org'],
    clientActionID: crypto.randomUUID(),
  });

  const refusal = await ctx.readRefusal(edit);

  expect(refusal).toStrictEqual({
    code: 'NOT_ALLOWED',
    data: { reason: 'widens' },
  });
});

test('#editRule refuses an edit that leaves no destination', async () => {
  const ctx = await setupTest();

  const edit = ctx.client.editRule({
    ruleID: 'allow-mail',
    revision: 1,
    destinations: [],
    clientActionID: crypto.randomUUID(),
  });

  const refusal = await ctx.readRefusal(edit);

  expect(refusal).toStrictEqual({ code: 'NOT_ALLOWED', data: { reason: 'empty' } });
});

test('#editRule refuses a moved revision with CONFLICT and the current revision', async () => {
  const ctx = await setupTest();

  const edit = ctx.client.editRule({
    ruleID: 'allow-mail',
    revision: 7,
    destinations: ['harbour@example.org'],
    clientActionID: crypto.randomUUID(),
  });

  const refusal = await ctx.readRefusal(edit);

  expect(refusal).toStrictEqual({ code: 'CONFLICT', data: { revision: 1 } });
});

test('#editRule refuses a rule that does not exist with NOT_FOUND', async () => {
  const ctx = await setupTest();

  const edit = ctx.client.editRule({
    ruleID: 'no-such-rule',
    revision: 1,
    destinations: ['harbour@example.org'],
    clientActionID: crypto.randomUUID(),
  });

  const refusal = await ctx.readRefusal(edit);

  expect(refusal).toStrictEqual({ code: 'NOT_FOUND', data: undefined });
});

test('#removeRule removes an allow rule at the revision shown', async () => {
  const ctx = await setupTest();

  const removed = await ctx.client.removeRule({
    ruleID: 'allow-mail',
    revision: 1,
    clientActionID: crypto.randomUUID(),
  });

  expect(removed).toStrictEqual({ ruleID: 'allow-mail' });

  const refusal = await ctx.readRefusal(ctx.client.readRule({ ruleID: 'allow-mail' }));

  expect(refusal).toStrictEqual({
    code: 'NOT_FOUND',
    data: undefined,
  });
});

test('#removeRule refuses a rule that is not an allow rule as widening', async () => {
  const ctx = await setupTest();

  const removal = ctx.client.removeRule({
    ruleID: 'deny-shell',
    revision: 1,
    clientActionID: crypto.randomUUID(),
  });

  const refusal = await ctx.readRefusal(removal);

  expect(refusal).toStrictEqual({
    code: 'NOT_ALLOWED',
    data: { reason: 'widens' },
  });
});

test('#removeRule refuses a moved revision with CONFLICT and the current revision', async () => {
  const ctx = await setupTest();

  const removal = ctx.client.removeRule({
    ruleID: 'allow-mail',
    revision: 3,
    clientActionID: crypto.randomUUID(),
  });

  const refusal = await ctx.readRefusal(removal);

  expect(refusal).toStrictEqual({ code: 'CONFLICT', data: { revision: 1 } });
});

test('#removeRule settles a retry of a removal that committed with the same result', async () => {
  const ctx = await setupTest();

  const call = { ruleID: 'allow-mail', revision: 1, clientActionID: crypto.randomUUID() };

  await ctx.client.removeRule(call);

  const retried = await ctx.client.removeRule(call);

  expect(retried).toStrictEqual({ ruleID: 'allow-mail' });
});

test('#removeRule refuses a client action ID that another change already used', async () => {
  const ctx = await setupTest();

  const clientActionID = crypto.randomUUID();

  await ctx.client.editRule({
    ruleID: 'allow-mail',
    revision: 1,
    destinations: ['harbour@example.org'],
    clientActionID,
  });

  const removal = ctx.client.removeRule({ ruleID: 'allow-mail', revision: 2, clientActionID });

  const refusal = await ctx.readRefusal(removal);

  expect(refusal).toStrictEqual({
    code: 'CLIENT_ACTION_ID_REUSED',
    data: undefined,
  });
});

test('#editRule waits for an earlier removal to finish its seed, so the removal stays', async () => {
  const ctx = await setupTest();

  const releaseSeeds = ctx.holdSeeds();

  const removal = ctx.client.removeRule({
    ruleID: 'allow-mail',
    revision: 1,
    clientActionID: crypto.randomUUID(),
  });

  await ctx.waitForSeedStart();

  const edit = ctx.client.editRule({
    ruleID: 'allow-mail',
    revision: 1,
    destinations: ['harbour@example.org'],
    clientActionID: crypto.randomUUID(),
  });

  // An edit that runs too early has no event to wait on: it finishes while the seed is held.
  // oxlint-disable-next-line zgeoff/no-test-sleep -- the wait is for an event that must not happen
  await Bun.sleep(100);

  releaseSeeds();

  const [removed, editRefusal] = await Promise.all([removal, ctx.readRefusal(edit)]);
  const readRefusal = await ctx.readRefusal(ctx.client.readRule({ ruleID: 'allow-mail' }));

  expect({ removed, editRefusal, readRefusal }).toStrictEqual({
    removed: { ruleID: 'allow-mail' },
    editRefusal: { code: 'NOT_FOUND', data: undefined },
    readRefusal: { code: 'NOT_FOUND', data: undefined },
  });
});

test('#editRule settles a retry after the rule was removed with the revision it first returned', async () => {
  const ctx = await setupTest();

  const call = {
    ruleID: 'allow-mail',
    revision: 1,
    destinations: ['harbour@example.org'],
    clientActionID: crypto.randomUUID(),
  };

  await ctx.client.editRule(call);

  await ctx.client.removeRule({
    ruleID: 'allow-mail',
    revision: 2,
    clientActionID: crypto.randomUUID(),
  });

  const retried = await ctx.client.editRule(call);

  expect(retried).toStrictEqual({ ruleID: 'allow-mail', revision: 2 });
});

test('#readRule reads the note, the words and the expression of a rule with a condition', async () => {
  const ctx = await setupTest();
  const rule = await ctx.client.readRule({ ruleID: 'allow-term-mail' });

  expect(rule).toStrictEqual({
    ruleID: 'allow-term-mail',
    revision: 1,
    sentence: expect.toInclude('when its condition holds'),
    condition: {
      note: 'Term mail goes out in the working day.',
      noteBy: 'you',
      words: 'the hour in Europe/London is before 17',
      source: 'now.getHours("Europe/London") < 17',
    },
    outcome: 'allow',
    destinations: ['harbour@example.org', 'marina@example.org'],
  });
});

test('#editRule drops a destination from a rule with a condition and keeps the condition', async () => {
  const ctx = await setupTest();

  await ctx.client.editRule({
    ruleID: 'allow-term-mail',
    revision: 1,
    destinations: ['harbour@example.org'],
    clientActionID: crypto.randomUUID(),
  });

  const rule = await ctx.client.readRule({ ruleID: 'allow-term-mail' });

  expect({ destinations: rule.destinations, source: rule.condition?.source }).toStrictEqual({
    destinations: ['harbour@example.org'],
    source: 'now.getHours("Europe/London") < 17',
  });
});

test('#removeRule removes a rule with its condition', async () => {
  const ctx = await setupTest();

  await ctx.client.removeRule({
    ruleID: 'allow-term-mail',
    revision: 1,
    clientActionID: crypto.randomUUID(),
  });

  const refusal = await ctx.readRefusal(ctx.client.readRule({ ruleID: 'allow-term-mail' }));

  expect(refusal).toStrictEqual({ code: 'NOT_FOUND', data: undefined });
});
