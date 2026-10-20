import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource } from '@heynixie/definitions';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { buildServerContext } from './build-server-context';
import { buildStartState } from './build-start-state';
import { refreshDefinitions } from './refresh-definitions';
import type { SeedPollParts } from './start-seed-poll';
import { startSeedPoll } from './start-seed-poll';
import { startTestLog } from './test-utils/start-test-log';
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

  const definitionsDir = join(ctx.directory, 'definitions');

  await rename(definitionsDir, join(ctx.directory, 'checkout'));

  const again = ctx.startAgain();

  const listening = await again.waitForLogEvent('http.listening');

  await again.waitForLogEvent('ready');

  await rename(join(ctx.directory, 'checkout'), definitionsDir);

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

test('it reports the definitions ready again once the source returns to its last good revision after a reload refused another', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-seed-poll-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  onTestFinished(() => log.writer.stop());

  const root = join(dataDir, 'definitions');
  const skill = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await mkdir(join(root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');
  await writeFile(join(root, 'skills', 'tide-tables', 'SKILL.md'), skill);

  const context = await buildServerContext(log.writer, log.deploymentKey, () => null);

  const clock = buildTestClock(0);

  const parts: SeedPollParts = {
    context: { ...context.apiContext, clock },
    source: createPathSource({ directory: root }),
    policy: { rules: [], tools: [] },
    inForce: context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: () => {},
    config: { definitions: { probeIntervalMs: 60_000 } },
    cleanup: {
      defer: (stop) => {
        onTestFinished(stop);

        return Promise.resolve();
      },
    },
  };

  await startSeedPoll(parts, { isRefusedAtStart: false });

  clock.advance(60_000);

  await waitForCondition(() => parts.state.read().definitions.isReady);
  await waitForCondition(() => clock.countSleepers() === 1);
  await writeFile(join(root, 'skills', 'tide-tables', 'SKILL.md'), '# Tides, by port\n');

  const refused = await refreshDefinitions(parts, parts.inForce);

  const afterRefusal = parts.state.read().definitions.isReady;

  await writeFile(join(root, 'skills', 'tide-tables', 'SKILL.md'), skill);

  clock.advance(60_000);

  await waitForCondition(() => parts.state.read().definitions.isReady);

  expect(refused?.persona).toBe('# Persona\n');
  expect(afterRefusal).toBeFalse();
  expect(parts.state.read().definitions).toStrictEqual({ isReady: true, reason: null });
});
