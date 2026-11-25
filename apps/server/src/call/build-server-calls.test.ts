import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildBuiltInBudgets } from '@heynixie/budgets';
import { callBudgetName, startCall } from '@heynixie/calls';
import { buildFakeSpeechLayer } from '@heynixie/calls/test-utils';
import { contract } from '@heynixie/contract';
import { createPathSource, readDefinitionsInForce, runSeed } from '@heynixie/definitions';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import { startWriter } from '@heynixie/log';
import { createTestClient } from '../test-utils/create-test-client';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';
import { buildServerCalls } from './build-server-calls';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-server-calls-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(join(root, 'voice'), { recursive: true });
  await writeFile(join(root, 'nixie.yaml'), 'format: 5\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  return { directory, root };
}

test('it boots with a voice file that is not text and a voice file with no price, and keeps serving', async () => {
  const nixie = await startInProcessNixie({
    extraConfig: ['voice:', '  provider: gpt-live', '  credential: deployment:speech'],
    extraSecrets: ['connector_credentials:', '  speech: speech-key-a'],
    beforeStart: async (files) => {
      const root = join(dirname(files.dataDir), 'definitions');

      await mkdir(join(root, 'voice'));
      await writeFile(join(root, 'nixie.yaml'), 'format: 5\n');
      await writeFile(join(root, 'voice', 'voice.yaml'), 'voice: cedar\n');
      await writeFile(join(root, 'voice', 'lines.yaml'), new Uint8Array([0xff, 0xfe, 0x3a]));
    },
  });

  const api = await createTestClient(nixie);
  const skipped = await nixie.waitForLogEvent('definitions.voice_file_skipped');

  const refused = api.client.calls.start({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(skipped).toMatchObject({ path: 'voice/lines.yaml' });
  expect(refused).rejects.toMatchObject({ code: 'SPEECH_UNAVAILABLE' });
});

test('it refuses a call with VOICE_PRICE_MISSING when the definitions in force hold no price', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'voice', 'voice.yaml'), 'voice: cedar\n');

  const writer = await startWriter({ dataDir: ctx.directory });

  onTestFinished(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log = { writer, deploymentKey, projections: [] };

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log,
    source: createPathSource({ directory: ctx.root }),
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForce = await readDefinitionsInForce(writer.db);

  const definitions = () => ({ snapshotHash: inForce?.snapshotHash ?? '' });

  const calls = buildServerCalls({
    log,
    clock: writer.clock,
    definitions,
    budgets: {
      log,
      clock: writer.clock,
      zone: 'UTC',
      definitions,
      builtIn: () => buildBuiltInBudgets([callBudgetName]),
    },
    inForce: { read: () => inForce, set: () => {} },
    voice: { provider: 'gpt-live', credential: 'deployment:speech_key' },
    logEvent: () => {},
  });

  const result = await startCall(
    { ...calls, speech: buildFakeSpeechLayer() },
    { carryingSession: 'identity-1' },
  );

  expect([
    seeded.status,
    result,
    contract.calls.start['~orpc'].errorMap.VOICE_PRICE_MISSING?.message,
  ]).toStrictEqual([
    'seeded',
    { status: 'refused', error: 'VOICE_PRICE_MISSING' },
    'voice/voice.yaml in the definitions has no price_per_minute',
  ]);
});
