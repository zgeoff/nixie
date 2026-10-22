import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { RuntimeReport } from '@heynixie/sandbox';
import { buildStubCheck, buildTestClock, waitForCondition } from '@heynixie/testing';
import { buildCleanup } from './build-cleanup';
import { buildStartState } from './build-start-state';
import { startServerHealth } from './start-server-health';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-server-health-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  onTestFinished(() => writer.stop());

  const clock = buildTestClock(0);
  const cleanup = buildCleanup();

  onTestFinished(() => {
    clock.advance(2000);

    return cleanup.stop();
  });

  return { dataDir, writer, clock, cleanup };
}

test('it answers readiness from the last impd report while a later impd check hangs', async () => {
  const ctx = await setupTest();

  const state = buildStartState({ isReady: true, reason: null });

  state.update({
    definitions: { isReady: true, reason: null },
    images: { isReady: true, reason: null },
    conversation: { isReady: true, reason: null },
    areRunnersStarted: true,
  });

  const stub = buildStubCheck<RuntimeReport>(() =>
    Promise.resolve({ isReady: true, reason: null }),
  );

  const app = await startServerHealth({
    writer: ctx.writer,
    state,
    adapter: { checkRuntime: stub.check },
    dataDir: ctx.dataDir,
    clock: ctx.clock,
    cleanup: ctx.cleanup,
    log: () => {},
  });

  await waitForCondition(async () => {
    const response = await app.handle(new Request('http://nixie.test/health/ready'));
    const body: unknown = await response.json();

    return JSON.stringify(body).includes('"status":"ready"');
  });

  stub.answerWith(() => Promise.withResolvers<RuntimeReport>().promise);
  ctx.clock.advance(5000);

  await waitForCondition(() => stub.check.mock.calls.length === 2);

  const responses = await Promise.all(
    Array.from({ length: 3 }, () => app.handle(new Request('http://nixie.test/health/ready'))),
  );

  const bodies: unknown[] = await Promise.all(responses.map((response) => response.json()));

  expect(responses.map((response) => response.status)).toStrictEqual([200, 200, 200]);
  expect(bodies).toSatisfyAll((body) => JSON.stringify(body).includes('"status":"ready"'));
  expect(stub.check).toHaveBeenCalledTimes(2);
});

test('it answers readiness with 200 and the status degraded, and logs the imp host by name, once an impd check outlasts its timeout', async () => {
  const ctx = await setupTest();

  const state = buildStartState({ isReady: true, reason: null });

  state.update({
    definitions: { isReady: true, reason: null },
    images: { isReady: true, reason: null },
    conversation: { isReady: true, reason: null },
    areRunnersStarted: true,
  });

  const log = mock<Logger>();

  const app = await startServerHealth({
    writer: ctx.writer,
    state,
    adapter: { checkRuntime: () => Promise.withResolvers<RuntimeReport>().promise },
    dataDir: ctx.dataDir,
    clock: ctx.clock,
    cleanup: ctx.cleanup,
    log,
  });

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(2000);

  await waitForCondition(async () => {
    const response = await app.handle(new Request('http://nixie.test/health/ready'));
    const body: unknown = await response.json();

    return response.status === 200 && JSON.stringify(body).includes('"status":"degraded"');
  });

  const response = await app.handle(new Request('http://nixie.test/health/ready'));

  expect(response.status).toBe(200);

  expect(response.json()).resolves.toMatchObject({
    status: 'degraded',
    dependencies: {
      imp_host: { isReady: false, reason: 'the check took longer than 2000 ms' },
      disk: { isReady: true, reason: null },
    },
  });

  expect(log).toHaveBeenCalledWith(
    'health.part_unready',
    { probe: 'ready', part: 'imp_host', reason: 'the check took longer than 2000 ms' },
    'warn',
  );
});
