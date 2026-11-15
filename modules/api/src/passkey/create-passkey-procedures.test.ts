import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { createTestAuthenticator } from '../test-utils/create-test-authenticator';
import { seedPasskey } from '../test-utils/seed-passkey';
import { startTestAPI } from '../test-utils/start-test-api';
import { createPasskeyCode } from './create-passkey-code';

async function setupTest() {
  const origin = 'https://nixie.example.org';

  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  return {
    api,
    laptop,
    origin,
    refusalOf: async (call: Promise<unknown>) => {
      try {
        return await call;
      } catch (error) {
        return error;
      }
    },
    client: buildTestClient(api.url, laptop.token, origin),
    clientAt: (at: string | undefined, token = laptop.token) => buildTestClient(api.url, token, at),
    readKinds: (
      kinds: readonly (
        | 'passkey.registered'
        | 'passkey.revoked'
        | 'passkey.used'
        | 'passkey_code.issued'
      )[],
    ) => readRecords(api.context.log, { afterSequence: 0, kinds: [...kinds] }),
  };
}

test('#passkeys.registrationOptions refuses a first passkey with no host code', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.refusalOf(ctx.client.passkeys.registrationOptions({}));

  expect(outcome).toMatchObject({
    code: 'CODE_REQUIRED',
  });
});

test('#passkeys.registrationOptions refuses a code that was never issued', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.refusalOf(
    ctx.client.passkeys.registrationOptions({ code: 'ABCDE-FGHJK' }),
  );

  expect(outcome).toMatchObject({
    code: 'CODE_INVALID',
  });
});

test('#passkeys.registrationOptions asks for a discoverable credential with user verification on the origin of the call', async () => {
  const ctx = await setupTest();
  const issued = await createPasskeyCode(ctx.api.context);
  const result = await ctx.client.passkeys.registrationOptions({ code: issued.code });

  expect(result.options).toStrictEqual({
    rp: { id: 'nixie.example.org', name: 'nixie' },
    user: { id: expect.any(String), name: 'nixie', displayName: 'nixie' },
    challenge: expect.any(String),
    pubKeyCredParams: expect.arrayContaining([{ type: 'public-key', alg: -7 }]),
    timeout: 300_000,
    excludeCredentials: [],
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    },
    attestation: 'none',
  });
});

test('#passkeys.registrationOptions accepts a host code once', async () => {
  const ctx = await setupTest();
  const issued = await createPasskeyCode(ctx.api.context);

  await ctx.client.passkeys.registrationOptions({ code: issued.code });

  const outcome = await ctx.refusalOf(
    ctx.client.passkeys.registrationOptions({ code: issued.code }),
  );

  expect(outcome).toMatchObject({
    code: 'CODE_INVALID',
  });
});

test('#passkeys.registrationOptions refuses a host code after 15 minutes', async () => {
  const ctx = await setupTest();
  const issued = await createPasskeyCode(ctx.api.context);

  ctx.api.clock.advance(15 * 60 * 1000);

  const outcome = await ctx.refusalOf(
    ctx.client.passkeys.registrationOptions({ code: issued.code }),
  );

  expect(outcome).toMatchObject({
    code: 'CODE_INVALID',
  });
});

test('#passkeys.registrationOptions replaces the first host code with the second', async () => {
  const ctx = await setupTest();
  const first = await createPasskeyCode(ctx.api.context);

  await createPasskeyCode(ctx.api.context);

  const outcome = await ctx.refusalOf(
    ctx.client.passkeys.registrationOptions({ code: first.code }),
  );

  expect(outcome).toMatchObject({
    code: 'CODE_INVALID',
  });
});

test.each([
  ['plain http', 'http://nixie.example.org'],
  ['an IPv4 address', 'https://192.0.2.10'],
  ['an IPv6 address', 'https://[2001:db8::1]'],
  ['no Origin header', undefined],
])('#passkeys.registrationOptions refuses %s with ORIGIN_UNSUPPORTED', async (_name, at) => {
  const ctx = await setupTest();
  const issued = await createPasskeyCode(ctx.api.context);

  const outcome = await ctx.refusalOf(
    ctx.clientAt(at).passkeys.registrationOptions({ code: issued.code }),
  );

  expect(outcome).toMatchObject({ code: 'ORIGIN_UNSUPPORTED' });
});

test('#passkeys.registrationOptions leaves the host code unused when it refuses the origin', async () => {
  const ctx = await setupTest();
  const issued = await createPasskeyCode(ctx.api.context);

  await ctx.refusalOf(
    ctx.clientAt('http://nixie.example.org').passkeys.registrationOptions({ code: issued.code }),
  );

  const result = await ctx.client.passkeys.registrationOptions({ code: issued.code });

  expect(result.options.rp.id).toBe('nixie.example.org');
});

test('#passkeys.register adds the passkey and #passkeys.list shows it with its authorization', async () => {
  const ctx = await setupTest();
  const issued = await createPasskeyCode(ctx.api.context);
  const authenticator = await createTestAuthenticator();
  const optionsIssued = await ctx.client.passkeys.registrationOptions({ code: issued.code });

  const options = optionsIssued.options;

  const response = await authenticator.register(options, {
    origin: ctx.origin,
    isBackupEligible: true,
    isBackedUp: true,
  });

  const registered = await ctx.client.passkeys.register({
    clientActionID: crypto.randomUUID(),
    response,
    label: 'Phone',
  });

  const listed = await ctx.client.passkeys.list();

  expect(listed).toStrictEqual({
    passkeys: [
      {
        passkeyID: registered.passkeyID,
        label: 'Phone',
        synced: true,
        authorizedBy: 'code',
        registeredAt: expect.any(Date),
        lastUsedAt: null,
        revokedAt: null,
      },
    ],
  });
});

test('#passkeys.register labels a passkey with the session label when none is given, and lists a single-device passkey as not synced', async () => {
  const ctx = await setupTest();

  await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  const listed = await ctx.client.passkeys.list();

  expect(listed.passkeys.map((passkey) => [passkey.label, passkey.synced])).toStrictEqual([
    ['laptop', false],
  ]);
});

test('#passkeys.register records the registration with the label as an erasable field', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller, label: 'Phone' });
  const records = await ctx.readKinds(['passkey.registered']);

  expect(
    records.map((read) => [
      read.record.payload,
      read.record.erasable.status === 'readable' ? read.record.erasable.fields : null,
    ]),
  ).toStrictEqual([
    [
      {
        passkeyID: seeded.passkeyID,
        registeredBy: ctx.laptop.sessionID,
        authorizedBy: 'code',
      },
      { label: 'Phone' },
    ],
  ]);
});

test('#passkeys.register refuses a response with no user verification', async () => {
  const ctx = await setupTest();
  const issued = await createPasskeyCode(ctx.api.context);
  const authenticator = await createTestAuthenticator();
  const optionsIssued = await ctx.client.passkeys.registrationOptions({ code: issued.code });

  const options = optionsIssued.options;

  const response = await authenticator.register(options, {
    origin: ctx.origin,
    isUserVerified: false,
  });

  const outcome = await ctx.refusalOf(
    ctx.client.passkeys.register({ clientActionID: crypto.randomUUID(), response }),
  );

  expect(outcome).toMatchObject({ code: 'REGISTRATION_FAILED' });
});

test('#passkeys.register fails from a session other than the one that asked', async () => {
  const ctx = await setupTest();
  const tablet = await createDeviceSession(ctx.api.context, 'tablet');
  const issued = await createPasskeyCode(ctx.api.context);
  const authenticator = await createTestAuthenticator();
  const optionsIssued = await ctx.client.passkeys.registrationOptions({ code: issued.code });

  const options = optionsIssued.options;

  const response = await authenticator.register(options, { origin: ctx.origin });

  const outcome = await ctx.refusalOf(
    ctx.clientAt(ctx.origin, tablet.token).passkeys.register({
      clientActionID: crypto.randomUUID(),
      response,
    }),
  );

  expect(outcome).toMatchObject({ code: 'REGISTRATION_FAILED' });
});

test('#passkeys.register fails once the options lapse after 5 minutes', async () => {
  const ctx = await setupTest();
  const issued = await createPasskeyCode(ctx.api.context);
  const authenticator = await createTestAuthenticator();
  const optionsIssued = await ctx.client.passkeys.registrationOptions({ code: issued.code });

  const options = optionsIssued.options;

  const response = await authenticator.register(options, { origin: ctx.origin });

  ctx.api.clock.advance(5 * 60 * 1000);

  const outcome = await ctx.refusalOf(
    ctx.client.passkeys.register({ clientActionID: crypto.randomUUID(), response }),
  );

  expect(outcome).toMatchObject({ code: 'REGISTRATION_FAILED' });
});

test('#passkeys.register works once for the options it answers', async () => {
  const ctx = await setupTest();
  const issued = await createPasskeyCode(ctx.api.context);
  const authenticator = await createTestAuthenticator();
  const optionsIssued = await ctx.client.passkeys.registrationOptions({ code: issued.code });

  const options = optionsIssued.options;

  const response = await authenticator.register(options, { origin: ctx.origin });

  await ctx.client.passkeys.register({ clientActionID: crypto.randomUUID(), response });

  const outcome = await ctx.refusalOf(
    ctx.client.passkeys.register({ clientActionID: crypto.randomUUID(), response }),
  );

  expect(outcome).toMatchObject({ code: 'REGISTRATION_FAILED' });
});

test('#passkeys.registrationOptions refuses another origin while a passkey is live', async () => {
  const ctx = await setupTest();

  await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  const issued = await createPasskeyCode(ctx.api.context);

  const outcome = await ctx.refusalOf(
    ctx.clientAt('https://other.example.org').passkeys.registrationOptions({ code: issued.code }),
  );

  expect(outcome).toMatchObject({ code: 'ORIGIN_CHANGED' });
});

test('#passkeys.registrationOptions lists each live passkey in excludeCredentials', async () => {
  const ctx = await setupTest();
  const first = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const issued = await createPasskeyCode(ctx.api.context);
  const optionsIssued = await ctx.client.passkeys.registrationOptions({ code: issued.code });

  const options = optionsIssued.options;

  expect(options.excludeCredentials).toStrictEqual([
    { id: first.authenticator.credentialID, type: 'public-key' },
  ]);
});

test('#passkeys.registrationOptions accepts a live passkey in place of a host code, and the registration names it as the authorization', async () => {
  const ctx = await setupTest();
  const first = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const requestIssued = await ctx.client.passkeys.challenge({ for: { kind: 'register' } });

  const request = requestIssued.options;

  const assertion = await first.authenticator.assert(request, { origin: ctx.origin });
  const optionsIssued = await ctx.client.passkeys.registrationOptions({ passkey: assertion });

  const options = optionsIssued.options;

  const second = await createTestAuthenticator();

  const added = await ctx.client.passkeys.register({
    clientActionID: crypto.randomUUID(),
    response: await second.register(options, { origin: ctx.origin }),
  });

  const listed = await ctx.client.passkeys.list();

  expect(listed.passkeys.map((passkey) => [passkey.passkeyID, passkey.authorizedBy])).toStrictEqual(
    [
      [first.passkeyID, 'code'],
      [added.passkeyID, first.passkeyID],
    ],
  );
});

test('#passkeys.registrationOptions refuses an assertion on a challenge for another check', async () => {
  const ctx = await setupTest();
  const first = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  const requestIssued = await ctx.client.passkeys.challenge({
    for: { kind: 'revoke', passkeyID: first.passkeyID },
  });

  const request = requestIssued.options;

  const assertion = await first.authenticator.assert(request, { origin: ctx.origin });

  const outcome = await ctx.refusalOf(
    ctx.client.passkeys.registrationOptions({ passkey: assertion }),
  );

  expect(outcome).toMatchObject({
    code: 'PASSKEY_FAILED',
    data: { reason: 'binding' },
  });
});

test('#passkeys.register fails when a revoke of the authorizing passkey committed first', async () => {
  const ctx = await setupTest();
  const first = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const requestIssued = await ctx.client.passkeys.challenge({ for: { kind: 'register' } });

  const request = requestIssued.options;

  const assertion = await first.authenticator.assert(request, { origin: ctx.origin });
  const optionsIssued = await ctx.client.passkeys.registrationOptions({ passkey: assertion });

  const options = optionsIssued.options;

  const second = await createTestAuthenticator();
  const response = await second.register(options, { origin: ctx.origin });

  const revokeRequestIssued = await ctx.client.passkeys.challenge({
    for: { kind: 'revoke', passkeyID: first.passkeyID },
  });

  const revokeRequest = revokeRequestIssued.options;

  await ctx.client.passkeys.revoke({
    clientActionID: crypto.randomUUID(),
    passkeyID: first.passkeyID,
    passkey: await first.authenticator.assert(revokeRequest, { origin: ctx.origin }),
  });

  const outcome = await ctx.refusalOf(
    ctx.client.passkeys.register({ clientActionID: crypto.randomUUID(), response }),
  );

  expect(outcome).toMatchObject({ code: 'REGISTRATION_FAILED' });
});

test('#passkeys.registrationOptions refuses an 11th live passkey with TOO_MANY_PASSKEYS', async () => {
  const ctx = await setupTest();

  for (let count = 0; count < 10; count += 1) {
    await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  }

  const issued = await createPasskeyCode(ctx.api.context);

  const outcome = await ctx.refusalOf(
    ctx.client.passkeys.registrationOptions({ code: issued.code }),
  );

  expect(outcome).toMatchObject({
    code: 'TOO_MANY_PASSKEYS',
  });
});

test('#passkeys.challenge refuses with NO_PASSKEY when no passkey is live', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.refusalOf(ctx.client.passkeys.challenge({ for: { kind: 'register' } }));

  expect(outcome).toMatchObject({
    code: 'NO_PASSKEY',
  });
});

test('#passkeys.challenge issues options that take no allowed-credential list and require user verification', async () => {
  const ctx = await setupTest();

  await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  const optionsIssued = await ctx.client.passkeys.challenge({ for: { kind: 'register' } });

  const options = optionsIssued.options;

  expect(options).toStrictEqual({
    challenge: expect.any(String),
    rpId: 'nixie.example.org',
    allowCredentials: [],
    userVerification: 'required',
    timeout: 300_000,
  });
});

test('#passkeys.revoke refuses an assertion that no live passkey signed', async () => {
  const ctx = await setupTest();
  const first = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const stranger = await createTestAuthenticator();

  const optionsIssued = await ctx.client.passkeys.challenge({
    for: { kind: 'revoke', passkeyID: first.passkeyID },
  });

  const options = optionsIssued.options;

  const outcome = await ctx.refusalOf(
    ctx.client.passkeys.revoke({
      clientActionID: crypto.randomUUID(),
      passkeyID: first.passkeyID,
      passkey: await stranger.assert(options, { origin: ctx.origin }),
    }),
  );

  expect(outcome).toMatchObject({ code: 'PASSKEY_FAILED', data: { reason: 'unknown_passkey' } });
});

test('#passkeys.revoke revokes a passkey on the assertion of another live passkey and records it', async () => {
  const ctx = await setupTest();
  const first = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const second = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  const optionsIssued = await ctx.client.passkeys.challenge({
    for: { kind: 'revoke', passkeyID: first.passkeyID },
  });

  const options = optionsIssued.options;

  await ctx.client.passkeys.revoke({
    clientActionID: crypto.randomUUID(),
    passkeyID: first.passkeyID,
    passkey: await second.authenticator.assert(options, { origin: ctx.origin }),
  });

  const records = await ctx.readKinds(['passkey.revoked']);

  expect(records.map((read) => read.record.payload)).toStrictEqual([
    { passkeyID: first.passkeyID, revokedBy: ctx.laptop.sessionID },
  ]);
});

test('#passkeys.revoke lets a passkey revoke itself and leaves the revoked row in the list', async () => {
  const ctx = await setupTest();
  const only = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  const optionsIssued = await ctx.client.passkeys.challenge({
    for: { kind: 'revoke', passkeyID: only.passkeyID },
  });

  const options = optionsIssued.options;

  await ctx.client.passkeys.revoke({
    clientActionID: crypto.randomUUID(),
    passkeyID: only.passkeyID,
    passkey: await only.authenticator.assert(options, { origin: ctx.origin }),
  });

  const listed = await ctx.client.passkeys.list();

  expect(listed.passkeys.map((passkey) => passkey.revokedAt)).toStrictEqual([expect.any(Date)]);

  const outcome = await ctx.refusalOf(ctx.client.passkeys.challenge({ for: { kind: 'register' } }));

  expect(outcome).toMatchObject({
    code: 'NO_PASSKEY',
  });
});

test('#passkeys.revoke refuses an unknown passkey with NOT_FOUND', async () => {
  const ctx = await setupTest();
  const first = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  const optionsIssued = await ctx.client.passkeys.challenge({
    for: { kind: 'revoke', passkeyID: 'missing' },
  });

  const options = optionsIssued.options;

  const outcome = await ctx.refusalOf(
    ctx.client.passkeys.revoke({
      clientActionID: crypto.randomUUID(),
      passkeyID: 'missing',
      passkey: await first.authenticator.assert(options, { origin: ctx.origin }),
    }),
  );

  expect(outcome).toMatchObject({ code: 'NOT_FOUND' });
});

test('#passkeys.revoke returns the first result for a retry with the same client action ID', async () => {
  const ctx = await setupTest();
  const first = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  const clientActionID = crypto.randomUUID();

  const optionsIssued = await ctx.client.passkeys.challenge({
    for: { kind: 'revoke', passkeyID: first.passkeyID },
  });

  const options = optionsIssued.options;

  const input = {
    clientActionID,
    passkeyID: first.passkeyID,
    passkey: await first.authenticator.assert(options, { origin: ctx.origin }),
  };

  const done = await ctx.client.passkeys.revoke(input);
  const again = await ctx.client.passkeys.revoke(input);

  expect(again).toStrictEqual(done);
});
