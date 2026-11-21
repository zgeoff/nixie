import { expect, test } from 'bun:test';
import { imagesConfigSchema } from './images-config-schema';

test('it parses a default and the profiles it names', () => {
  const parsed = imagesConfigSchema.safeParse({
    default: 'main',
    profiles: {
      main: {
        provider: 'openai',
        model: 'model-a',
        credential: 'deployment:key-a',
        prices: { '1024x1024': 40_000, '1536x1024': 60_000, '1024x1536': 60_000 },
      },
    },
  });

  expect(parsed.success).toBe(true);
});

test('it refuses a profile that lists no price for a size', () => {
  const parsed = imagesConfigSchema.safeParse({
    default: 'main',
    profiles: {
      main: {
        provider: 'openai',
        model: 'model-a',
        credential: 'deployment:key-a',
        prices: { '1024x1024': 40_000, '1536x1024': 60_000 },
      },
    },
  });

  expect(parsed.success).toBe(false);
});

test('it refuses a default that no profile has', () => {
  const parsed = imagesConfigSchema.safeParse({
    default: 'other',
    profiles: {
      main: {
        provider: 'gemini',
        model: 'model-a',
        credential: 'deployment:key-a',
        prices: { '1024x1024': 40_000, '1536x1024': 60_000, '1024x1536': 60_000 },
      },
    },
  });

  expect(parsed.success).toBe(false);
});

test('it refuses a credential that is not a deployment entry', () => {
  const parsed = imagesConfigSchema.safeParse({
    default: 'main',
    profiles: {
      main: {
        provider: 'gemini',
        model: 'model-a',
        credential: 'key-a',
        prices: { '1024x1024': 40_000, '1536x1024': 60_000, '1024x1536': 60_000 },
      },
    },
  });

  expect(parsed.success).toBe(false);
});
