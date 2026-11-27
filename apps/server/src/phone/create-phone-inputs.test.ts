import { expect, test } from 'bun:test';
import { createTestCredentials } from '@heynixie/credentials/test-utils';
import { createPhoneInputs } from './create-phone-inputs';
import { phoneSectionSchema } from './phone-section-schema';

async function setupTest() {
  const credentials = await createTestCredentials({ connector_credentials: { twilio: 'secret' } });

  const section = phoneSectionSchema.parse({
    number: '+61411111111',
    twilio: {
      account_sid: 'AC00000000000000000000000000000000',
      api_key_sid: 'SK00000000000000000000000000000000',
      credential: 'deployment:twilio',
    },
  });

  return { credentials, section };
}

test('it returns no phone for a config with no phone section', async () => {
  const ctx = await setupTest();

  const inputs = createPhoneInputs(undefined, {
    credentials: ctx.credentials,
    wake: { window: 900_000, reply_expiry: 604_800_000 },
    isFaked: true,
    now: () => 1_000_000,
  });

  expect(inputs).toBeNull();
});

test('it stamps a text of the faked provider with the time of the clock it is given', async () => {
  const ctx = await setupTest();

  const inputs = createPhoneInputs(ctx.section, {
    credentials: ctx.credentials,
    wake: { window: 900_000, reply_expiry: 604_800_000 },
    isFaked: true,
    now: () => 1_000_000,
  });

  const text = inputs?.fake?.deliver({ from: 'Example', body: 'Hello' });

  expect(text?.receivedAt).toBe(1_000_000);
});
