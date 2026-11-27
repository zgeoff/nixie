import { expect, test } from 'bun:test';
import { createTestCredentials } from '@heynixie/credentials/test-utils';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildServerSpeech } from './build-server-speech';

async function setupTest(secrets: Record<string, string>) {
  const credentials = await createTestCredentials({ connector_credentials: secrets });

  const logged: { event: string; fields: unknown }[] = [];

  const build = (reference: string) =>
    buildServerSpeech({
      voice: { provider: 'gpt-live', credential: reference },
      credentials,
      clock: createFakeClock(),
      logEvent: (event, fields) => {
        logged.push({ event, fields });
      },
    });

  return { build, logged };
}

test('it builds the GPT-Live layer when the voice credential is in the secrets file', async () => {
  const ctx = await setupTest({ speech: 'fake-key' });

  expect(ctx.build('deployment:speech')?.model).toBe('gpt-live-1');
});

test('it builds no speech layer, and logs why, when the voice credential is not in the secrets file', async () => {
  const ctx = await setupTest({ other: 'fake-key' });

  const layer = ctx.build('deployment:speech');

  expect(layer).toBeNull();

  expect(ctx.logged).toStrictEqual([
    {
      event: 'calls.speech_credential_missing',
      fields: {
        reason:
          'voice.credential is deployment:speech, and the secrets file has no connector_credentials entry speech',
      },
    },
  ]);
});
