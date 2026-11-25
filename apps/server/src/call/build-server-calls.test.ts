import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildFakeSpeechLayer } from '@heynixie/calls/test-utils';
import { createTestClient } from '../test-utils/create-test-client';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';

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

test('it answers a call start with VOICE_PRICE_MISSING naming the file, once a speech layer is wired and the price is missing', async () => {
  const nixie = await startInProcessNixie({
    extraConfig: ['voice:', '  provider: gpt-live', '  credential: deployment:speech'],
    extraSecrets: ['connector_credentials:', '  speech: speech-key-a'],
    speech: buildFakeSpeechLayer(),
    beforeStart: async (files) => {
      const root = join(dirname(files.dataDir), 'definitions');

      await mkdir(join(root, 'voice'));
      await writeFile(join(root, 'nixie.yaml'), 'format: 5\n');
      await writeFile(join(root, 'voice', 'voice.yaml'), 'voice: cedar\n');
    },
  });

  const api = await createTestClient(nixie);

  const refused = api.client.calls.start({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({
    code: 'VOICE_PRICE_MISSING',
    message: 'voice/voice.yaml in the definitions has no price_per_minute',
  });
});
