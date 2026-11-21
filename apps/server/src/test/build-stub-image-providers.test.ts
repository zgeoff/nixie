import { expect, test } from 'bun:test';
import { imagesConfigSchema } from '@heynixie/connectors';
import { buildStubImageProviders } from './build-stub-image-providers';

test('it builds one stub for each profile of the images block', () => {
  const prices = { '1024x1024': 40_000, '1536x1024': 60_000, '1024x1536': 60_000 };

  const config = imagesConfigSchema.parse({
    default: 'main',
    profiles: {
      main: { provider: 'openai', model: 'model-a', credential: 'deployment:a', prices },
      second: { provider: 'gemini', model: 'model-b', credential: 'deployment:b', prices },
    },
  });

  expect(Object.keys(buildStubImageProviders(config))).toStrictEqual(['main', 'second']);
});
