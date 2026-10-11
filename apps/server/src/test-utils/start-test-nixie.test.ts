import { expect, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
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

test('its stop signal returns once nixie logs that its stop began', async () => {
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
