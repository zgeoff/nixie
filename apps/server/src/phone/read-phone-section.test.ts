import { expect, test } from 'bun:test';
import type { SecretsFile } from '@heynixie/credentials';
import { MissingCredentialError, readSetting } from '@heynixie/credentials';
import { phoneSectionSchema } from './phone-section-schema';
import { readPhoneSection } from './read-phone-section';

function setupTest(settings: Readonly<Record<string, string>>) {
  const file: SecretsFile = {
    deployment_key: 'not-a-real-key',
    model_credentials: {},
    connector_credentials: {},
    settings,
  };

  return {
    read: (reference: string, configKey: string) => readSetting(file, reference, configKey),
  };
}

test('it keeps a section of plain values as it is', () => {
  const ctx = setupTest({});

  const section = phoneSectionSchema.parse({
    number: '+61411111111',
    twilio: {
      account_sid: 'AC00000000000000000000000000000000',
      api_key_sid: 'SK00000000000000000000000000000000',
      credential: 'deployment:twilio',
    },
  });

  expect(readPhoneSection(section, ctx.read)).toStrictEqual(section);
});

test('it returns no section for a config with none', () => {
  const ctx = setupTest({});

  expect(readPhoneSection(undefined, ctx.read)).toBeUndefined();
});

test('it reads the number from the settings entry that its reference names', () => {
  const ctx = setupTest({ phone_number: '+61422222222' });

  const section = phoneSectionSchema.parse({
    number: 'deployment:phone_number',
    twilio: {
      account_sid: 'AC00000000000000000000000000000000',
      api_key_sid: 'SK00000000000000000000000000000000',
      credential: 'deployment:twilio',
    },
  });

  expect(readPhoneSection(section, ctx.read)?.number).toBe('+61422222222');
});

test('it reads the account SID from the settings entry that its reference names', () => {
  const ctx = setupTest({ account_sid: 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });

  const section = phoneSectionSchema.parse({
    number: '+61411111111',
    twilio: {
      account_sid: 'deployment:account_sid',
      api_key_sid: 'SK00000000000000000000000000000000',
      credential: 'deployment:twilio',
    },
  });

  expect(readPhoneSection(section, ctx.read)?.twilio.account_sid).toBe(
    'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  );
});

test('it reads the API key SID from the settings entry that its reference names', () => {
  const ctx = setupTest({ key_sid: 'SKbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });

  const section = phoneSectionSchema.parse({
    number: '+61411111111',
    twilio: {
      account_sid: 'AC00000000000000000000000000000000',
      api_key_sid: 'deployment:key_sid',
      credential: 'deployment:twilio',
    },
  });

  expect(readPhoneSection(section, ctx.read)?.twilio.api_key_sid).toBe(
    'SKbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  );
});

test.each([
  { key: 'phone.number', number: 'deployment:missing', account: 'AC0', apiKey: 'SK0' },
  {
    key: 'phone.twilio.account_sid',
    number: '+61411111111',
    account: 'deployment:missing',
    apiKey: 'SK0',
  },
  {
    key: 'phone.twilio.api_key_sid',
    number: '+61411111111',
    account: 'AC0',
    apiKey: 'deployment:missing',
  },
])('it names $key when its reference has no settings entry', (row) => {
  const ctx = setupTest({ other: '+61433333333' });

  const section = phoneSectionSchema.parse({
    number: row.number,
    twilio: {
      account_sid: row.account.replace('AC0', 'AC00000000000000000000000000000000'),
      api_key_sid: row.apiKey.replace('SK0', 'SK00000000000000000000000000000000'),
      credential: 'deployment:twilio',
    },
  });

  expect(() => readPhoneSection(section, ctx.read)).toThrowWithMessage(
    MissingCredentialError,
    `${row.key} is deployment:missing, and the secrets file has no settings entry missing`,
  );
});

test('it refuses a settings entry that is no number, without quoting the entry', () => {
  const ctx = setupTest({ phone_number: 'not-a-number-0411' });

  const section = phoneSectionSchema.parse({
    number: 'deployment:phone_number',
    twilio: {
      account_sid: 'AC00000000000000000000000000000000',
      api_key_sid: 'SK00000000000000000000000000000000',
      credential: 'deployment:twilio',
    },
  });

  expect(() => readPhoneSection(section, ctx.read)).toThrowWithMessage(
    Error,
    'phone.number is deployment:phone_number, and its settings entry is not a valid value',
  );
});

test('it refuses a number that is neither a number nor a reference', () => {
  const result = phoneSectionSchema.safeParse({
    number: 'phone_number',
    twilio: {
      account_sid: 'AC00000000000000000000000000000000',
      api_key_sid: 'SK00000000000000000000000000000000',
      credential: 'deployment:twilio',
    },
  });

  expect(result.success).toBe(false);
});
