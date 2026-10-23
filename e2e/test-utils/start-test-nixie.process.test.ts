import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { loadDeploymentConfig } from '@heynixie/server';
import { createTestClient } from '@heynixie/server/test-utils';
import { probeProcessGone, readDescendants, waitForCondition } from '@heynixie/testing';
import { startTestNixie } from './start-test-nixie';

test('it starts nixie on the crash harness clock at 1,000,000 ms', async () => {
  const nixie = await startTestNixie();

  const first = nixie.harness.start();

  await first.ready;

  expect(nixie.harness.now()).toBe(1_000_000);
});

test('it reads back the records that nixie writes', async () => {
  const nixie = await startTestNixie();

  const first = nixie.harness.start();

  await first.ready;

  const created = await first.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  const record = await nixie.waitForRecord((candidate) => candidate.stepKey === `${taskID}:1`);

  expect(record).toMatchObject({ thread: taskID, stepKey: `${taskID}:1` });
});

test('it keeps the leases and the tasks that each start recovered', async () => {
  const nixie = await startTestNixie();

  const taskID = 'wait-an-hour';
  const first = nixie.harness.start([{ point: 'claim.after', workID: taskID }]);

  await first.ready;

  await first.request('createTask', { brief: 'Wait an hour.', taskID });
  await first.waitForArrival('claim.after', taskID);
  await first.kill();

  const second = nixie.harness.start();

  await second.ready;

  const states = nixie.readRecoveredStates();

  expect(states[0]).toStrictEqual({ leases: [], tasks: [] });

  expect(states[1]?.leases).toIncludeAllPartialMembers([
    { kind: 'task', work_id: taskID, holder: null, generation: 1 },
  ]);

  expect(states[1]?.tasks).toIncludeAllPartialMembers([
    { task_id: 'conversation' },
    { task_id: taskID, state: 'ready' },
  ]);
});

test('it waits for the queue check of the latest start, not an earlier one', async () => {
  const nixie = await startTestNixie();

  const first = nixie.harness.start();

  await first.ready;

  await nixie.waitForQueueCheck();
  await first.kill();

  const second = nixie.harness.start([{ point: 'claim.after', kind: 'action' }]);

  await second.ready;

  const checked = (async () => {
    await nixie.waitForQueueCheck();

    return nixie.readRecords();
  })();

  const arrival = await second.waitForArrival('claim.after');

  second.release(arrival);

  const records = await checked;

  expect(
    records
      .filter((record) => record.kind === 'action.outcome' && record.thread === 'queue-check')
      .map((record) => record.payload['status']),
  ).toStrictEqual(['done', 'done']);
});

test('it removes its directory once the test finishes', async () => {
  const nixie = await startTestNixie();

  const first = nixie.harness.start();

  await first.ready;

  onTestFinished(() => {
    expect(existsSync(nixie.directory)).toBeFalse();
  });
});

test('it reads the records and the exit once nixie exits', async () => {
  const nixie = await startTestNixie();

  const server = nixie.harness.start();

  await server.ready;

  server.signal('SIGTERM');

  const run = await server.waitForExit();

  expect(run.exit).toStrictEqual({ code: 0, signal: null });
  expect(run.records).toIncludeAllPartialMembers([{ kind: 'definitions_seeded' }]);
});

test('it rejects a wait for a log event once nixie exits without it', async () => {
  const nixie = await startTestNixie();

  const server = nixie.harness.start();

  await server.ready;

  server.signal('SIGTERM');

  await server.waitForExit();

  expect(server.waitForLogEvent('no-such-event')).rejects.toThrow(
    /^nixie exited without the log event no-such-event:\n/u,
  );
});

test('it returns from the stop signal once nixie logs that its stop began', async () => {
  const nixie = await startTestNixie();

  const server = nixie.harness.start();

  await server.ready;

  await server.sendStopSignal();

  expect(server.readOutput()).toInclude('"event":"stopping"');
});

test('it reads nixie.db and keys.db from the data directory', async () => {
  const nixie = await startTestNixie();

  const server = nixie.harness.start();

  await server.ready;

  const files = await nixie.readDataFiles();

  expect(files.map((file) => file.name)).toIncludeAllMembers(['nixie.db', 'keys.db']);
});

test('it stops the guest of a turn still running once the test finishes', async () => {
  const nixie = await startTestNixie();

  const server = nixie.harness.start();

  const clients = await createTestClient(server);

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
  const nixie = await startTestNixie();

  const first = nixie.harness.start();

  await first.ready;

  first.signal('SIGTERM');

  await first.waitForExit();

  const again = nixie.harness.start();

  const started = await again.waitForLogEvent('writer.started');

  expect(started['schemaFrom']).toBeGreaterThan(0);
});

test('it reads the ID of each sandbox the process double holds', async () => {
  const nixie = await startTestNixie();

  const server = nixie.harness.start();

  await server.ready;

  const ids = await nixie.readSandboxIDs();

  server.signal('SIGTERM');

  const run = await server.waitForExit();

  expect(ids.length).toBeGreaterThan(0);

  expect(
    run.records
      .filter((record) => record.kind === 'sandbox.created')
      .map((record) => record.payload['sandboxID']),
  ).toIncludeAllMembers([...ids]);
});

test('it writes the log level it names into the configuration', async () => {
  const nixie = await startTestNixie({ logLevel: 'warn' });
  const config = await loadDeploymentConfig(nixie.configPath);

  expect(config.server.logLevel).toBe('warn');
});

test('it gives the memory writer and the checker their own scripted models when asked', async () => {
  const nixie = await startTestNixie({ memoryWriter: true });
  const config = await loadDeploymentConfig(nixie.configPath);

  expect(config.memory_writer.isEnabled).toBeTrue();
  expect(config.models.profiles['scripted-memory-writer']?.baseURL).toBe(nixie.writerModel.url);
  expect(config.models.profiles['scripted-checker']?.baseURL).toBe(nixie.checkerModel.url);
});

test('it keeps the memory writer and the consolidator off unless asked', async () => {
  const nixie = await startTestNixie();
  const config = await loadDeploymentConfig(nixie.configPath);

  expect(config.memory_writer.isEnabled).toBeFalse();
  expect(config.memory_consolidation.isEnabled).toBeFalse();
});
