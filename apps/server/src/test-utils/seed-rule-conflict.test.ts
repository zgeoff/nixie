import { expect, test } from 'bun:test';
import { z } from 'zod';
import { runHostCommand } from './run-host-command';
import { seedRuleConflict } from './seed-rule-conflict';
import { startInProcessNixie } from './start-in-process-nixie';

test('it leaves a conflict on ask-mail for the nixie that starts on the data', async () => {
  const nixie = await startInProcessNixie({ seedData: (files) => seedRuleConflict(files) });

  await nixie.waitForLogEvent('ready');

  const listed = await runHostCommand(nixie.configPath, ['rules', 'conflicts']);

  const conflictSchema = z.object({
    ruleID: z.string(),
    nixie: z.object({ sentence: z.string() }),
  });

  const conflicts = z.array(conflictSchema).parse(JSON.parse(listed.stdout));

  expect(conflicts.map((conflict) => [conflict.ruleID, conflict.nixie.sentence])).toStrictEqual([
    ['ask-mail', '**Deny** `mail.send`.'],
  ]);
});
