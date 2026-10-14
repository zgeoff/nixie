import { expect, test } from 'bun:test';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import { waitForCondition } from '@heynixie/testing';
import { startTestNixie } from './test-utils/start-test-nixie';

// nixie in a test build after one start reached ready and stopped, so its database holds a seed
async function setupTest() {
  const nixie = await startTestNixie();

  await nixie.waitForLogEvent('ready');
  await nixie.sendStopSignal();
  await nixie.waitForExit();
  return nixie;
}

test('it reports the definitions ready within seconds of a checkout that lands after a restart', async () => {
  const ctx = await setupTest();
  const definitionsDir = join(ctx.dir, 'definitions');

  await rename(definitionsDir, join(ctx.dir, 'checkout'));
  const again = ctx.startAgain();
  const listening = await again.waitForLogEvent('http.listening');

  await again.waitForLogEvent('ready');
  await rename(join(ctx.dir, 'checkout'), definitionsDir);
  const landedAt = Date.now();

  await waitForCondition(
    async () => {
      const ready = await fetch(`http://127.0.0.1:${String(listening['port'])}/health/ready`);

      return ready.ok;
    },
    { timeoutMs: 30_000 },
  );

  expect(Date.now() - landedAt).toBeLessThan(5000);
}, 60_000);
