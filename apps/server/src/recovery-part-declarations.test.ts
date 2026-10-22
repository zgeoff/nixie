import { expect, test } from 'bun:test';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { waitForCondition } from '@heynixie/testing';
import { z } from 'zod';
import { startTestNixie } from './test-utils/start-test-nixie';

async function setupTest() {
  const nixie = await startTestNixie();

  return nixie;
}

test('it seeds the first definitions within seconds of a checkout that lands after a fresh start', async () => {
  const ctx = await setupTest();

  await ctx.waitForLogEvent('ready');
  await ctx.sendStopSignal();
  await ctx.waitForExit();

  await rm(ctx.dataDir, { recursive: true });
  await mkdir(ctx.dataDir);

  const definitionsDir = join(ctx.directory, 'definitions');

  await rename(definitionsDir, join(ctx.directory, 'checkout'));

  const again = ctx.startAgain();

  const listening = await again.waitForLogEvent('http.listening');

  await again.waitForLogEvent('start.retry');

  await rename(join(ctx.directory, 'checkout'), definitionsDir);

  const landedAt = Date.now();

  await waitForCondition(
    async () => {
      const ready = await fetch(`http://127.0.0.1:${String(listening['port'])}/health/ready`);
      const body: unknown = await ready.json();

      const definitions = z.object({ isReady: z.boolean() });
      const report = z.object({ parts: z.object({ definitions }) }).parse(body);

      return report.parts.definitions.isReady;
    },
    { timeoutMs: 30_000 },
  );

  expect(Date.now() - landedAt).toBeLessThan(5000);
}, 60_000);
