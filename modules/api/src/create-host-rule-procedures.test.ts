import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource, runInForceSeed, runSeed, writeRuntimeRule } from '@heynixie/definitions';
import { startWriter } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { createRouterClient } from '@orpc/server';
import { createHostRuleProcedures } from './create-host-rule-procedures';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-host-rules-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(join(root, 'rules'), { recursive: true });

  const clock = buildTestClock(Date.UTC(2026, 9, 16, 9, 0));

  const writer = await startWriter({
    dataDir: directory,
    clock: { ...clock, sleep: () => Promise.resolve() },
  });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log = { writer, deploymentKey, projections: [] };

  const context = {
    log,
    clock,
    definitions: () => ({ snapshotHash: 'snapshot-a' }),
    runInForceSeed: () => runInForceSeed({ log, buildPolicy: () => ({ rules: [], tools: [] }) }),
  };

  return {
    root,
    context,
    client: createRouterClient(createHostRuleProcedures(context)),
    seed: () =>
      runSeed({
        log,
        source: createPathSource({ directory: root }),
        buildPolicy: () => ({ rules: [], tools: [] }),
      }),
  };
}

test('#list shows each rule in force with its sentence, revision and origin', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'shell.yaml'),
    'deny-shell:\n  outcome: deny\n  tools: [shell.run]\n',
  );

  await ctx.seed();

  const rules = await ctx.client.list();

  expect(rules).toStrictEqual([
    {
      ruleID: 'deny-shell',
      revision: 1,
      ruleHash: expect.any(String),
      sentence: expect.stringContaining('shell.run'),
      origin: 'definitions',
      changeID: null,
      lastFiredAt: null,
    },
  ]);
});

test("#conflicts shows nixie's version, the repo's version and the base of each conflict", async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  const change = await writeRuntimeRule(ctx.context, {
    ruleID: 'ask-mail',
    rule: { outcome: 'ask', tools: ['mail.send', 'mail.reply'] },
    changedBy: 'nixie',
    reason: 'Replies need the same check.',
  });

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: deny\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  const conflicts = await ctx.client.conflicts();

  expect(conflicts).toStrictEqual([
    {
      ruleID: 'ask-mail',
      changeID: change.changeID,
      nixie: { ruleHash: expect.any(String), sentence: expect.stringContaining('mail.reply') },
      repo: { ruleHash: expect.any(String), sentence: expect.stringContaining('mail.send') },
      base: { ruleHash: expect.any(String), sentence: expect.stringContaining('mail.send') },
      changedBy: 'nixie',
      reason: 'Replies need the same check.',
      changedAt: new Date(Date.UTC(2026, 9, 16, 9, 0)),
    },
  ]);
});

test("#resolve puts the repo's version in force when you keep the repo's", async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  const change = await writeRuntimeRule(ctx.context, {
    ruleID: 'ask-mail',
    rule: { outcome: 'ask', tools: ['mail.send', 'mail.reply'] },
    changedBy: 'nixie',
    reason: 'Replies need the same check.',
  });

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: deny\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  const resolved = await ctx.client.resolve({ ruleID: 'ask-mail', keep: 'repo' });
  const rules = await ctx.client.list();

  expect(resolved).toStrictEqual({ ruleID: 'ask-mail', changeID: change.changeID, keep: 'repo' });

  expect(rules.map((rule) => [rule.ruleID, rule.origin])).toStrictEqual([
    ['ask-mail', 'definitions'],
  ]);
});

test('#resolve refuses a rule with no conflict as not found', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await ctx.seed();

  const resolved = ctx.client.resolve({ ruleID: 'ask-mail', keep: 'nixie' });

  await Promise.allSettled([resolved]);

  expect(resolved).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('#proposals.list shows a pending rule change proposal with the sentence of each version', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  const proposals = await ctx.client.proposals.list();

  expect(proposals).toStrictEqual([
    {
      proposalID: expect.any(String),
      changes: [
        {
          ruleID: 'allow-web',
          before: null,
          after: { ruleHash: expect.any(String), sentence: expect.stringContaining('web.fetch') },
        },
      ],
      createdAt: new Date(Date.UTC(2026, 9, 16, 9, 0)),
      lapseAt: expect.any(Date),
    },
  ]);
});

test('#proposals.approve puts the widening in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  const [pending] = await ctx.client.proposals.list();

  const proposalID = pending?.proposalID ?? 'missing';

  await ctx.client.proposals.approve({ proposalID });

  const rules = await ctx.client.list();

  expect(rules.map((rule) => rule.ruleID)).toStrictEqual(['allow-web']);
});

test('#proposals.reject leaves the widening out of force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  const [pending] = await ctx.client.proposals.list();

  const proposalID = pending?.proposalID ?? 'missing';

  const rejected = await ctx.client.proposals.reject({ proposalID, reason: 'Not this week.' });
  const rules = await ctx.client.list();

  expect({ rejected, rules }).toStrictEqual({ rejected: { proposalID }, rules: [] });
});

test('#proposals.approve refuses a proposal it has no record of as not found', async () => {
  const ctx = await setupTest();

  const approved = ctx.client.proposals.approve({ proposalID: 'p-missing' });

  await Promise.allSettled([approved]);

  expect(approved).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('#proposals.reject refuses a proposal you answered as closed', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  const [pending] = await ctx.client.proposals.list();

  const proposalID = pending?.proposalID ?? 'missing';

  await ctx.client.proposals.approve({ proposalID });

  const rejected = ctx.client.proposals.reject({ proposalID, reason: 'Not this week.' });

  await Promise.allSettled([rejected]);

  expect(rejected).rejects.toMatchObject({ code: 'PROPOSAL_CLOSED' });
});
