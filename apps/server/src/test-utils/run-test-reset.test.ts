import { expect, test } from 'bun:test';
import { runHostCommand } from './run-host-command';
import { runTestReset } from './run-test-reset';
import { startInProcessNixie } from './start-in-process-nixie';

test('it resets nixie and starts it again on the same data directory', async () => {
  const nixie = await startInProcessNixie();

  await nixie.waitForLogEvent('ready');

  const reset = await runTestReset(nixie);

  expect(reset.command.exitCode).toBe(0);
  expect(reset.serverExit).toBe(0);
  expect(reset.lastSequence).toBeGreaterThan(0);
  expect(reset.again.dataDir).toBe(nixie.dataDir);
});

test('it runs the reset that its flags name, and starts nixie again', async () => {
  const nixie = await startInProcessNixie();

  await nixie.waitForLogEvent('ready');

  const reset = await runTestReset(nixie, ['--only', 'conversations', '--yes']);

  expect(reset.command.exitCode).toBe(0);
  expect(reset.command.stdout).toStartWith('nixie shredded ');
  expect(reset.serverExit).toBe(0);
});

test('it connects a signed-out client to the server started again', async () => {
  const nixie = await startInProcessNixie();

  await nixie.waitForLogEvent('ready');

  const reset = await runTestReset(nixie);
  const code = await runHostCommand(nixie.configPath, ['enrol-code']);

  const enrolled = await reset.connect().sessions.enrol({
    clientActionID: crypto.randomUUID(),
    code: code.stdout.split('\n')[0] ?? '',
    deviceName: 'tablet',
    tokenDelivery: 'bearer',
  });

  expect(enrolled.token).toBeString();
});

test('it stops the server started again and reads its records', async () => {
  const nixie = await startInProcessNixie();

  await nixie.waitForLogEvent('ready');

  const reset = await runTestReset(nixie);
  const run = await reset.stop();

  expect(run.exitCode).toBe(0);

  expect(run.records.at(0)).toMatchObject({
    sequence: reset.lastSequence + 1,
    kind: 'definitions_seeded',
  });
});
