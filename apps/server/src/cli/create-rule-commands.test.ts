import { expect, mock, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { runHostCommand } from '../test-utils/run-host-command';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';
import { runCLI } from './run-cli';

async function setupTest() {
  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: async (files) => {
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

test('it lists the rules in force, with the allows of a first seed beside its denies', async () => {
  const ctx = await setupTest();
  const listed = await runHostCommand(ctx.configPath, ['rules', 'list']);

  const rules = z
    .array(z.object({ ruleID: z.string(), origin: z.string() }))
    .parse(JSON.parse(listed.stdout));

  expect(rules.map((rule) => [rule.ruleID, rule.origin])).toStrictEqual([
    ['allow-web', 'definitions'],
    ['deny-shell', 'definitions'],
  ]);
});

test('it lists no pending proposal after a first seed that adds an allow', async () => {
  const ctx = await setupTest();
  const pending = await runHostCommand(ctx.configPath, ['proposals', 'list']);

  expect({ exitCode: pending.exitCode, stdout: pending.stdout }).toStrictEqual({
    exitCode: 0,
    stdout: '[]\n',
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
  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: (_files, seed) => seed.ruleConflict(),
  });

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
