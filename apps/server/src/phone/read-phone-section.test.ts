import { expect, test } from 'bun:test';
import type { SecretsFile } from '@heynixie/credentials';
import { MissingCredentialError, readSetting } from '@heynixie/credentials';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';
import { phoneSectionSchema } from './phone-section-schema';
import { readPhoneSection } from './read-phone-section';

function setupTest() {
  return {
    startNixie: startInProcessNixie,
    readFrom: (settings: Readonly<Record<string, string>>) => {
      const file: SecretsFile = {
        deployment_key: 'not-a-real-key',
        model_credentials: {},
        connector_credentials: {},
        settings,
      };

      return (reference: string, configKey: string) => readSetting(file, reference, configKey);
    },
  };
}

test('it keeps a section of plain values as it is', () => {
  const ctx = setupTest();
  const read = ctx.readFrom({});

  const section = phoneSectionSchema.parse({
    number: '+61411111111',
    twilio: {
      account_sid: 'AC00000000000000000000000000000000',
      api_key_sid: 'SK00000000000000000000000000000000',
      credential: 'deployment:twilio',
    },
  });

  expect(readPhoneSection(section, read)).toStrictEqual(section);
});

test('it returns no section for a config with none', () => {
  const ctx = setupTest();
  const read = ctx.readFrom({});

  expect(readPhoneSection(undefined, read)).toBeUndefined();
});

test('it reads the number from the settings entry that its reference names', () => {
  const ctx = setupTest();
  const read = ctx.readFrom({ phone_number: '+61422222222' });

  const section = phoneSectionSchema.parse({
    number: 'deployment:phone_number',
    twilio: {
      account_sid: 'AC00000000000000000000000000000000',
      api_key_sid: 'SK00000000000000000000000000000000',
      credential: 'deployment:twilio',
    },
  });

  expect(readPhoneSection(section, read)?.number).toBe('+61422222222');
});

test('it reads the account SID from the settings entry that its reference names', () => {
  const ctx = setupTest();
  const read = ctx.readFrom({ account_sid: 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });

  const section = phoneSectionSchema.parse({
    number: '+61411111111',
    twilio: {
      account_sid: 'deployment:account_sid',
      api_key_sid: 'SK00000000000000000000000000000000',
      credential: 'deployment:twilio',
    },
  });

  expect(readPhoneSection(section, read)?.twilio.account_sid).toBe(
    'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  );
});

test('it reads the API key SID from the settings entry that its reference names', () => {
  const ctx = setupTest();
  const read = ctx.readFrom({ key_sid: 'SKbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });

  const section = phoneSectionSchema.parse({
    number: '+61411111111',
    twilio: {
      account_sid: 'AC00000000000000000000000000000000',
      api_key_sid: 'deployment:key_sid',
      credential: 'deployment:twilio',
    },
  });

  expect(readPhoneSection(section, read)?.twilio.api_key_sid).toBe(
    'SKbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  );
});

test.each([
  {
    key: 'phone.number',
    number: 'deployment:missing',
    account: 'AC00000000000000000000000000000000',
    apiKey: 'SK00000000000000000000000000000000',
  },
  {
    key: 'phone.twilio.account_sid',
    number: '+61411111111',
    account: 'deployment:missing',
    apiKey: 'SK00000000000000000000000000000000',
  },
  {
    key: 'phone.twilio.api_key_sid',
    number: '+61411111111',
    account: 'AC00000000000000000000000000000000',
    apiKey: 'deployment:missing',
  },
])('it names $key when its reference has no settings entry', (row) => {
  const ctx = setupTest();
  const read = ctx.readFrom({ other: '+61433333333' });

  const section = phoneSectionSchema.parse({
    number: row.number,
    twilio: { account_sid: row.account, api_key_sid: row.apiKey, credential: 'deployment:twilio' },
  });

  expect(() => readPhoneSection(section, read)).toThrowWithMessage(
    MissingCredentialError,
    `${row.key} is deployment:missing, and the secrets file has no settings entry missing`,
  );
});

test('it refuses a settings entry that is no number, without quoting the entry', () => {
  const ctx = setupTest();
  const read = ctx.readFrom({ phone_number: 'not-a-number-0411' });

  const section = phoneSectionSchema.parse({
    number: 'deployment:phone_number',
    twilio: {
      account_sid: 'AC00000000000000000000000000000000',
      api_key_sid: 'SK00000000000000000000000000000000',
      credential: 'deployment:twilio',
    },
  });

  expect(() => readPhoneSection(section, read)).toThrowWithMessage(
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

test('it refuses to start when the phone number names a settings entry the secrets file lacks, and exits 1', async () => {
  const ctx = setupTest();

  const nixie = await ctx.startNixie({
    extraConfig: [
      'phone:',
      '  number: deployment:phone_number',
      '  twilio:',
      '    account_sid: AC00000000000000000000000000000000',
      '    api_key_sid: SK00000000000000000000000000000000',
      '    credential: deployment:twilio',
    ],
    extraSecrets: ['connector_credentials:', '  twilio: not-a-real-secret'],
  });

  const exitCode = await nixie.exited;
  const failure = await nixie.waitForLogEvent('command.failed');

  expect(exitCode).toBe(1);

  expect(failure).toMatchObject({
    command: 'serve',
    message: expect.toInclude(
      'phone.number is deployment:phone_number, and the secrets file has no settings entry phone_number',
    ),
  });
});

test('it starts with the phone number and the Twilio IDs in the secrets file', async () => {
  const ctx = setupTest();

  const nixie = await ctx.startNixie({
    extraConfig: [
      'phone:',
      '  number: deployment:phone_number',
      '  twilio:',
      '    account_sid: deployment:twilio_account_sid',
      '    api_key_sid: deployment:twilio_key_sid',
      '    credential: deployment:twilio',
      '    api_url: https://api.twilio.test',
    ],
    extraSecrets: [
      'connector_credentials:',
      '  twilio: not-a-real-secret',
      'settings:',
      '  phone_number: "+61411111111"',
      '  twilio_account_sid: AC00000000000000000000000000000000',
      '  twilio_key_sid: SK00000000000000000000000000000000',
    ],
  });

  await nixie.waitForLogEvent('ready');

  nixie.signalStop();

  const exitCode = await nixie.exited;

  expect(exitCode).toBe(0);
  expect(JSON.stringify(nixie.readLogEvents())).not.toInclude('+61411111111');
});
