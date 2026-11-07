import { expect, mock, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { runCLI } from './run-cli';
import { createTestClient } from './test-utils/create-test-client';
import { runHostCommand } from './test-utils/run-host-command';
import { seedRuleConflict } from './test-utils/seed-rule-conflict';
import { startInProcessNixie } from './test-utils/start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie({
    seedData: async (files) => {
      const definitions = join(dirname(files.configPath), 'definitions');

      await writeFile(join(definitions, 'nixie.yaml'), 'format: 3\n');
      await mkdir(join(definitions, 'rules'));

      await writeFile(
        join(definitions, 'rules', 'start.yaml'),
        'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n' +
          'deny-shell:\n  outcome: deny\n  tools: [shell.run]\n',
      );
    },
  });

  await nixie.waitForLogEvent('ready');

  return nixie;
}

test('it lists the rules in force, with the allows of a first seed left out until you approve them', async () => {
  const ctx = await setupTest();
  const listed = await runHostCommand(ctx.configPath, ['rules', 'list']);

  const rules = z
    .array(z.object({ ruleID: z.string(), origin: z.string() }))
    .parse(JSON.parse(listed.stdout));

  expect(rules.map((rule) => [rule.ruleID, rule.origin])).toStrictEqual([
    ['deny-shell', 'definitions'],
  ]);
});

test('it puts the allows of a first seed in force when you approve their proposal', async () => {
  const ctx = await setupTest();
  const pending = await runHostCommand(ctx.configPath, ['proposals', 'list']);

  const [proposal] = z
    .tuple([z.object({ proposalID: z.string() })])
    .parse(JSON.parse(pending.stdout));

  await runHostCommand(ctx.configPath, ['proposals', 'approve', proposal.proposalID]);

  const listed = await runHostCommand(ctx.configPath, ['rules', 'list']);

  const rules = z.array(z.object({ ruleID: z.string() })).parse(JSON.parse(listed.stdout));

  expect(rules.map((rule) => rule.ruleID)).toStrictEqual(['allow-web', 'deny-shell']);
});

test('it puts the allows of a first seed in force when a device approves their proposal', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);
  const pending = await api.client.rules.listProposals();

  const [proposal] = z.tuple([z.object({ proposalID: z.string() })]).parse(pending.proposals);

  await api.client.rules.approveProposal({ proposalID: proposal.proposalID });

  const listed = await runHostCommand(ctx.configPath, ['rules', 'list']);

  const rules = z.array(z.object({ ruleID: z.string() })).parse(JSON.parse(listed.stdout));

  expect(rules.map((rule) => rule.ruleID)).toStrictEqual(['allow-web', 'deny-shell']);
});

test('it leaves a rejected proposal out of the pending list', async () => {
  const ctx = await setupTest();
  const pending = await runHostCommand(ctx.configPath, ['proposals', 'list']);

  const [proposal] = z
    .tuple([z.object({ proposalID: z.string() })])
    .parse(JSON.parse(pending.stdout));

  const rejected = await runHostCommand(ctx.configPath, [
    'proposals',
    'reject',
    proposal.proposalID,
    '--reason',
    'Web fetches wait for next month.',
  ]);

  const after = await runHostCommand(ctx.configPath, ['proposals', 'list']);

  expect({ rejected: rejected.exitCode, after: after.stdout }).toStrictEqual({
    rejected: 0,
    after: '[]\n',
  });
});

test('it lists no conflicts while no runtime change conflicts with the repo', async () => {
  const ctx = await setupTest();
  const listed = await runHostCommand(ctx.configPath, ['rules', 'conflicts']);

  expect(listed.stdout).toBe('[]\n');
});

test.each([
  ['nixie', [['ask-mail', '**Deny** `mail.send`.']]],
  ['repo', [['ask-mail', '**Ask** before `mail.reply` or `mail.send`.']]],
])('it resolves a conflict with --keep %s and puts that version in force', async (keep, rules) => {
  const nixie = await startInProcessNixie({ seedData: (files) => seedRuleConflict(files) });

  await nixie.waitForLogEvent('ready');

  const resolved = await runHostCommand(nixie.configPath, [
    'rules',
    'resolve',
    'ask-mail',
    '--keep',
    keep,
  ]);

  const listed = await runHostCommand(nixie.configPath, ['rules', 'list']);

  const inForce = z
    .array(z.object({ ruleID: z.string(), sentence: z.string() }))
    .parse(JSON.parse(listed.stdout));

  expect({
    exitCode: resolved.exitCode,
    resolved: z.unknown().parse(JSON.parse(resolved.stdout)),
    inForce: inForce.map((rule) => [rule.ruleID, rule.sentence]),
  }).toStrictEqual({
    exitCode: 0,
    resolved: { ruleID: 'ask-mail', changeID: expect.any(String), keep },
    inForce: rules,
  });
});

test.each([
  ['a resolve with no --keep', ['rules', 'resolve', 'deny-shell']],
  [
    'a resolve that keeps the definitions',
    ['rules', 'resolve', 'deny-shell', '--keep', 'definitions'],
  ],
  [
    'a resolve with a second rule ID',
    ['rules', 'resolve', 'deny-shell', 'allow-web', '--keep', 'repo'],
  ],
  ['a rejection with no --reason', ['proposals', 'reject', 'p-rule-1']],
  ['an answer with no proposal ID', ['proposals', 'approve']],
])('it refuses %s while it reads the arguments', async (_name, argv) => {
  const io = { log: mock(), print: mock(), waitForSignal: mock() };

  const exitCode = await runCLI([...argv, '--config', '/nonexistent/config.yaml'], io);

  expect({ exitCode, printed: io.print.mock.calls.length }).toStrictEqual({
    exitCode: 1,
    printed: 1,
  });
});

test('it refuses an unknown rules action as an unknown command', async () => {
  const io = { log: mock(), print: mock(), waitForSignal: mock() };

  const exitCode = await runCLI(['rules', 'show', '--config', '/nonexistent/config.yaml'], io);

  expect({ exitCode, printed: io.print.mock.calls.length }).toStrictEqual({
    exitCode: 2,
    printed: 1,
  });
});
