import { expect, test } from 'bun:test';
import { runHostCommand } from './run-host-command';
import { seedDefinitionConflict } from './seed-definition-conflict';
import { startInProcessNixie } from './start-in-process-nixie';

test('it leaves a conflict on the definition for the nixie that starts on the data', async () => {
  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: (files) => seedDefinitionConflict(files),
  });

  await nixie.waitForLogEvent('ready');

  const resolved = await runHostCommand(nixie.configPath, [
    'definitions',
    'resolve',
    'water-the-tomatoes',
    '--keep',
    'nixie',
  ]);

  expect(resolved.exitCode).toBe(0);
});
