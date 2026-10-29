import { expect, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { loadDeploymentConfig } from '../load-deployment-config';
import { createTestClient } from './create-test-client';
import { startInProcessNixie } from './start-in-process-nixie';

test('it starts nixie in the test process and reaches ready', async () => {
  const nixie = await startInProcessNixie();
  const ready = await nixie.waitForLogEvent('ready');

  expect(ready).toMatchObject({ event: 'ready', level: 'info' });
});

test('it reads the records and the exit code once nixie stops', async () => {
  const nixie = await startInProcessNixie();

  await nixie.waitForLogEvent('ready');

  nixie.signalStop();

  const run = await nixie.waitForExit();

  expect(run.exitCode).toBe(0);
  expect(run.records).toIncludeAllPartialMembers([{ kind: 'definitions_seeded' }]);
});

test('it rejects a wait for a log event once nixie exits without it', async () => {
  const nixie = await startInProcessNixie();

  await nixie.waitForLogEvent('ready');

  nixie.signalStop();

  await nixie.exited;

  expect(nixie.waitForLogEvent('no-such-event')).rejects.toThrow(
    'nixie exited without the log event no-such-event',
  );
});

test('it reads nixie.db and keys.db from the data directory', async () => {
  const nixie = await startInProcessNixie();

  await nixie.waitForLogEvent('ready');

  const files = await nixie.readDataFiles();

  expect(files.map((file) => file.name)).toIncludeAllMembers(['nixie.db', 'keys.db']);
});

test('it stops nixie and removes its directory once the test finishes', async () => {
  const nixie = await startInProcessNixie();

  onTestFinished(() => {
    expect(nixie.exited).resolves.toBe(0);
    expect(stat(nixie.directory)).rejects.toThrow();
  });

  const listening = await nixie.waitForLogEvent('http.listening');

  expect(listening['port']).toBeNumber();
});

test('it lets a start that outlasts its test end before the cleanup runs', () => {
  const starting = startInProcessNixie();

  onTestFinished(() => {
    expect(Bun.peek.status(starting)).toBe('pending');
  });
});

test('it answers a turn through the stub guest, which receives the turn frame', async () => {
  const nixie = await startInProcessNixie();
  const api = await createTestClient(nixie);

  nixie.guest.addReplies({ text: 'The tide turns at noon.' });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'When does the tide turn?',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'The tide turns at noon.');
  });

  expect(nixie.guest.turns).toMatchObject([
    { input: [{ text: expect.toInclude('When does the tide turn?') }] },
  ]);
});

test('it reads the names of the tools a turn frame offers while its turn runs', async () => {
  const nixie = await startInProcessNixie();
  const api = await createTestClient(nixie);

  const gate = Promise.withResolvers<void>();

  nixie.guest.addReplies({ text: 'Low tide is at four.', gate: () => gate.promise });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'When is low tide?',
    thread: 'conversation',
  });

  await waitForCondition(() => nixie.guest.turns.length === 1);

  const [received] = nixie.guest.received;

  invariant(received);

  const names = await nixie.readToolNames(received);

  gate.resolve();

  expect(names).toIncludeAllMembers(['time.now', 'memory.recall']);
});

test('it keeps the result of each tool call the stub guest makes, in order', async () => {
  const nixie = await startInProcessNixie();
  const api = await createTestClient(nixie);

  nixie.guest.addReplies(
    { toolUse: { name: 'time.now', input: {} } },
    { text: 'It is noon in Oslo.' },
  );

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'What time is it in Oslo?',
    thread: 'conversation',
    timeZone: 'Europe/Oslo',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'It is noon in Oslo.');
  });

  expect(nixie.toolResults).toStrictEqual([
    { name: 'time.now', result: expect.toInclude('Europe/Oslo') },
  ]);
});

test('it starts nixie again on the same data directory and the same guest once it exits', async () => {
  const nixie = await startInProcessNixie();

  await nixie.waitForLogEvent('ready');

  const before = nixie.guest.readSandboxIDs();

  nixie.signalStop();

  await nixie.exited;

  const again = nixie.startAgain();

  const started = await again.waitForLogEvent('writer.started');

  await again.waitForLogEvent('ready');

  expect(started['schemaFrom']).toBeGreaterThan(0);
  expect(again.dataDir).toBe(nixie.dataDir);
  expect(before.length).toBeGreaterThan(0);
  expect(again.guest.readSandboxIDs()).toIncludeAllMembers([...before]);
});

test('it lists each run on the data directory in the order they started', async () => {
  const nixie = await startInProcessNixie();

  await nixie.waitForLogEvent('ready');

  nixie.signalStop();

  await nixie.exited;

  const again = nixie.startAgain();

  expect(again.readRuns()).toStrictEqual([nixie, again]);
});

test('it writes the log level it names into the configuration', async () => {
  const nixie = await startInProcessNixie({ logLevel: 'warn' });
  const config = await loadDeploymentConfig(nixie.configPath);

  expect(config.server.logLevel).toBe('warn');
});
