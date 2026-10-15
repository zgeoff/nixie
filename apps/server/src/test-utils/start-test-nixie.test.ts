import { expect, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { loadDeploymentConfig } from '../load-deployment-config';
import { startTestNixie } from './start-test-nixie';

test('it starts nixie in a test build and reaches ready', async () => {
  const nixie = await startTestNixie();
  const ready = await nixie.waitForLogEvent('ready');

  expect(ready).toMatchObject({ event: 'ready' });
}, 60_000);

test('it reads the records and the exit code once nixie exits', async () => {
  const nixie = await startTestNixie();

  await nixie.waitForLogEvent('ready');

  nixie.sendSignal('SIGTERM');

  const run = await nixie.waitForExit();

  expect(run.exitCode).toBe(0);
  expect(run.records).toIncludeAllPartialMembers([{ kind: 'definitions_seeded' }]);
}, 60_000);

test('it rejects a wait for a log event once nixie exits without it', async () => {
  const nixie = await startTestNixie();

  await nixie.waitForLogEvent('ready');

  nixie.sendSignal('SIGTERM');

  await nixie.waitForExit();

  expect(nixie.waitForLogEvent('no-such-event')).rejects.toThrow(
    /^nixie exited without the log event no-such-event:\n/u,
  );
}, 60_000);

test('it returns from the stop signal once nixie logs that its stop began', async () => {
  const nixie = await startTestNixie();

  await nixie.waitForLogEvent('ready');
  await nixie.sendStopSignal();

  expect(nixie.readOutput()).toInclude('"event":"stopping"');
}, 60_000);

test('it reads nixie.db and keys.db from the data directory', async () => {
  const nixie = await startTestNixie();

  await nixie.waitForLogEvent('ready');

  const files = await nixie.readDataFiles();

  expect(files.map((file) => file.name)).toIncludeAllMembers(['nixie.db', 'keys.db']);
}, 60_000);

test('it removes its directory once the test finishes', async () => {
  const nixie = await startTestNixie();

  onTestFinished(() => {
    expect(stat(nixie.dir)).rejects.toThrow();
  });

  const listening = await nixie.waitForLogEvent('http.listening');

  expect(listening['port']).toBeNumber();
}, 60_000);

test('it starts nixie again on the same data directory once it exits', async () => {
  const nixie = await startTestNixie();

  await nixie.waitForLogEvent('ready');

  nixie.sendSignal('SIGTERM');

  await nixie.waitForExit();

  const again = nixie.startAgain();

  const started = await again.waitForLogEvent('writer.started');

  expect(started['schemaFrom']).toBeGreaterThan(0);
  expect(again.dataDir).toBe(nixie.dataDir);
}, 60_000);

test('it reads the ID of each sandbox the process double holds', async () => {
  const nixie = await startTestNixie();

  await nixie.waitForLogEvent('ready');

  const ids = await nixie.readSandboxIDs();

  nixie.sendSignal('SIGTERM');

  const run = await nixie.waitForExit();

  expect(ids.length).toBeGreaterThan(0);

  expect(
    run.records
      .filter((record) => record.kind === 'sandbox.created')
      .map((record) => record.payload['sandboxID']),
  ).toIncludeAllMembers([...ids]);
}, 60_000);

test('it writes the log level it names into the configuration', async () => {
  const nixie = await startTestNixie({ logLevel: 'warn' });
  const config = await loadDeploymentConfig(nixie.configPath);

  expect(config.server.logLevel).toBe('warn');
}, 60_000);
