import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestAPI } from '@heynixie/api/test-utils';
import { buildAPIGate } from './build-api-gate';
import { buildCleanup } from './build-cleanup';
import { buildHostClient } from './build-host-client';
import { startHostCommands } from './start-host-commands';

// the host commands over the API's context in a fresh data directory, behind a gate the test closes
async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-host-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const api = await startTestAPI();

  const gate = buildAPIGate();
  const cleanup = buildCleanup();

  onTestFinished(() => cleanup.stop());

  await startHostCommands(
    {
      dataDir,
      apiContext: api.context,
      readMemory: () => null,
      runReset: () =>
        Promise.resolve({ resetAt: new Date(2_000_000), lastSequence: 12, keptSessions: 1 }),
      gate,
    },
    cleanup,
  );

  return { gate, client: buildHostClient(join(dataDir, 'run', 'control.sock')) };
}

test('it answers a host command while the gate is open', async () => {
  const ctx = await setupTest();
  const issued = await ctx.client.sessions.issueCode();

  expect(issued.code).toBeString();
});

test('it refuses a host command once a reset closes the gate', async () => {
  const ctx = await setupTest();

  await ctx.gate.close();

  expect(ctx.client.sessions.issueCode()).rejects.toMatchObject({ status: 503 });
});

test('it runs the reset itself once the gate is closed', async () => {
  const ctx = await setupTest();

  await ctx.gate.close();

  const reset = await ctx.client.reset();

  expect(reset).toStrictEqual({ resetAt: new Date(2_000_000), lastSequence: 12, keptSessions: 1 });
});
