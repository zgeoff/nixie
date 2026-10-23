import { expect, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { probeProcessGone, readDescendants, waitForCondition } from '@heynixie/testing';
import { loadDeploymentConfig } from '../load-deployment-config';
import { createTestClient } from './create-test-client';
import { spawnTestNixie } from './spawn-test-nixie';

test('it starts nixie in a test build and reaches ready', async () => {
  const nixie = await spawnTestNixie();
  const ready = await nixie.waitForLogEvent('ready');

  expect(ready).toMatchObject({ event: 'ready' });
});

test('it reads the records and the exit code once nixie exits', async () => {
  const nixie = await spawnTestNixie();

  await nixie.waitForLogEvent('ready');

  nixie.sendSignal('SIGTERM');

  const run = await nixie.waitForExit();

  expect(run.exitCode).toBe(0);
  expect(run.records).toIncludeAllPartialMembers([{ kind: 'definitions_seeded' }]);
});

test('it rejects a wait for a log event once nixie exits without it', async () => {
  const nixie = await spawnTestNixie();

  await nixie.waitForLogEvent('ready');

  nixie.sendSignal('SIGTERM');

  await nixie.waitForExit();

  expect(nixie.waitForLogEvent('no-such-event')).rejects.toThrow(
    /^nixie exited without the log event no-such-event:\n/u,
  );
});

test('it returns from the stop signal once nixie logs that its stop began', async () => {
  const nixie = await spawnTestNixie();

  await nixie.waitForLogEvent('ready');
  await nixie.sendStopSignal();

  expect(nixie.readOutput()).toInclude('"event":"stopping"');
});

test('it reads nixie.db and keys.db from the data directory', async () => {
  const nixie = await spawnTestNixie();

  await nixie.waitForLogEvent('ready');

  const files = await nixie.readDataFiles();

  expect(files.map((file) => file.name)).toIncludeAllMembers(['nixie.db', 'keys.db']);
});

test('it removes its directory once the test finishes', async () => {
  const nixie = await spawnTestNixie();

  onTestFinished(() => {
    expect(stat(nixie.directory)).rejects.toThrow();
  });

  const listening = await nixie.waitForLogEvent('http.listening');

  expect(listening['port']).toBeNumber();
});

test('it stops the guest of a turn still running once the test finishes', async () => {
  const nixie = await spawnTestNixie();
  const clients = await createTestClient(nixie);

  nixie.model.addReplies({ text: 'Held.', gate: Promise.withResolvers<void>().promise });

  await clients.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Check the tide at noon.',
    thread: 'conversation',
  });

  // the real guest starts the Agent SDK's CLI cold, which outlasts the default wait on a small host
  await waitForCondition(
    () => nixie.model.requests.some((request) => request.path === '/v1/messages'),
    { timeoutMs: 25_000, intervalMs: 100 },
  );

  const turnPIDs = readDescendants(process.pid);

  onTestFinished(async () => {
    await waitForCondition(() => turnPIDs.every((pid) => probeProcessGone(pid)));
  });

  expect(turnPIDs.length).toBeGreaterThanOrEqual(3);
});

test('it starts nixie again on the same data directory once it exits', async () => {
  const nixie = await spawnTestNixie();

  await nixie.waitForLogEvent('ready');

  nixie.sendSignal('SIGTERM');

  await nixie.waitForExit();

  const again = nixie.startAgain();

  const started = await again.waitForLogEvent('writer.started');

  expect(started['schemaFrom']).toBeGreaterThan(0);
  expect(again.dataDir).toBe(nixie.dataDir);
});

test('it reads the ID of each sandbox the process double holds', async () => {
  const nixie = await spawnTestNixie();

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
});

test('it writes the log level it names into the configuration', async () => {
  const nixie = await spawnTestNixie({ logLevel: 'warn' });
  const config = await loadDeploymentConfig(nixie.configPath);

  expect(config.server.logLevel).toBe('warn');
});
