import { expect, test } from 'bun:test';
import { imagesConfigSchema } from '@heynixie/connectors';
import { resolveImageSettings } from './resolve-image-settings';

function setupTest() {
  const prices = { '1024x1024': 40_000, '1536x1024': 60_000, '1024x1536': 60_000 };

  const config = imagesConfigSchema.parse({
    default: 'main',
    profiles: {
      main: { provider: 'openai', model: 'model-a', credential: 'deployment:openai', prices },
      second: { provider: 'gemini', model: 'model-b', credential: 'deployment:gemini', prices },
    },
  });

  return { config };
}

test('it returns null when the deployment sets no images block', () => {
  expect(resolveImageSettings(null, {})).toBeNull();
});

test('it gives each profile the key its credential names', () => {
  const ctx = setupTest();
  const settings = resolveImageSettings(ctx.config, { openai: 'key-a', gemini: 'key-b' });

  expect(settings?.apiKeys).toStrictEqual({ main: 'key-a', second: 'key-b' });
});

test('it throws and names the entry when the secrets file lacks a credential of a profile', () => {
  const ctx = setupTest();

  expect(() => resolveImageSettings(ctx.config, { openai: 'key-a' })).toThrow(
    'images.profiles.second.credential is deployment:gemini, and the secrets file has no connector_credentials entry gemini',
  );
});
