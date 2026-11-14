import { expect, test } from 'bun:test';
import { approveStarterRules } from './approve-starter-rules';
import { runHostCommand } from './run-host-command';
import { startInProcessNixie } from './start-in-process-nixie';

test('it puts the allows of the starter rules in force by approving their proposal', async () => {
  const nixie = await startInProcessNixie({ isStarterApproved: false });

  await nixie.waitForLogEvent('ready');

  const before = await runHostCommand(nixie.configPath, ['rules', 'list']);

  await approveStarterRules(nixie.configPath);

  const after = await runHostCommand(nixie.configPath, ['rules', 'list']);

  expect(before.stdout).not.toContain('"ruleID":"allow-reads"');
  expect(after.stdout).toContain('"ruleID":"allow-reads"');
});
