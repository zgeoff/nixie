import { expect, test } from 'bun:test';
import { claimEnrolmentCode } from './claim-enrolment-code';
import { createEnrolmentCode } from './create-enrolment-code';
import { deriveSecretHash } from './derive-secret-hash';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';
import { verifySessionToken } from './verify-session-token';

async function setupTest() {
  const api = await startTestAPI();
  const db = api.writer.db.$extendTables<APITables>();

  return { ...api, db };
}

test('it starts a device session from a code', async () => {
  const ctx = await setupTest();

  const issued = await createEnrolmentCode(ctx.context);
  const enrolled = await claimEnrolmentCode(ctx.context, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code,
    deviceName: 'laptop',
    tokenDelivery: 'bearer',
  });

  expect(enrolled).toStrictEqual({
    status: 'enrolled',
    sessionID: expect.toBeString(),
    token: expect.toBeString(),
  });
});

test('it refuses a code that a different enrolment already used', async () => {
  const ctx = await setupTest();

  const issued = await createEnrolmentCode(ctx.context);

  await claimEnrolmentCode(ctx.context, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code,
    deviceName: 'laptop',
    tokenDelivery: 'bearer',
  });

  const result = await claimEnrolmentCode(ctx.context, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    code: issued.code,
    deviceName: 'phone',
    tokenDelivery: 'bearer',
  });

  expect(result).toStrictEqual({ status: 'invalid' });
});

test('it refuses a code once 15 minutes have passed', async () => {
  const ctx = await setupTest();

  const issued = await createEnrolmentCode(ctx.context);

  ctx.clock.advance(15 * 60 * 1000);

  const result = await claimEnrolmentCode(ctx.context, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code,
    deviceName: 'laptop',
    tokenDelivery: 'bearer',
  });

  expect(result).toStrictEqual({ status: 'invalid' });
});

test('it accepts a code just before 15 minutes pass', async () => {
  const ctx = await setupTest();

  const issued = await createEnrolmentCode(ctx.context);

  ctx.clock.advance(15 * 60 * 1000 - 1);

  const enrolled = await claimEnrolmentCode(ctx.context, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code,
    deviceName: 'laptop',
    tokenDelivery: 'bearer',
  });

  expect(enrolled.status).toBe('enrolled');
});

test('it accepts a code typed in lower case without its dash', async () => {
  const ctx = await setupTest();

  const issued = await createEnrolmentCode(ctx.context);
  const enrolled = await claimEnrolmentCode(ctx.context, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code.toLowerCase().replace('-', ''),
    deviceName: 'laptop',
    tokenDelivery: 'bearer',
  });

  expect(enrolled.status).toBe('enrolled');
});

test('it refuses a code nixie never issued', async () => {
  const ctx = await setupTest();

  const result = await claimEnrolmentCode(ctx.context, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: 'K7P2X-Q9M4D',
    deviceName: 'laptop',
    tokenDelivery: 'bearer',
  });

  expect(result).toStrictEqual({ status: 'invalid' });
});

test('it stores only the hash of the session token and of the code', async () => {
  const ctx = await setupTest();

  const issued = await createEnrolmentCode(ctx.context);
  const enrolled = await claimEnrolmentCode(ctx.context, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code,
    deviceName: 'laptop',
    tokenDelivery: 'bearer',
  });

  if (enrolled.status !== 'enrolled') {
    throw new Error('the enrolment failed');
  }
  const stored = await Promise.all([
    Bun.file(`${ctx.dataDir}/nixie.db`).text(),
    Bun.file(`${ctx.dataDir}/nixie.db-wal`).text(),
  ]);
  const identity = await ctx.db
    .selectFrom('identities')
    .select('token_hash')
    .executeTakeFirstOrThrow();

  expect(identity.token_hash).toBe(deriveSecretHash(enrolled.token));
  expect(stored.join('')).not.toInclude(enrolled.token);
  expect(stored.join('')).not.toInclude(issued.code.replace('-', ''));
});

test('it answers a retry with the same session', async () => {
  const ctx = await setupTest();

  const issued = await createEnrolmentCode(ctx.context);
  const input = {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code,
    deviceName: 'laptop',
    tokenDelivery: 'bearer' as const,
  };
  const first = await claimEnrolmentCode(ctx.context, input);
  const retry = await claimEnrolmentCode(ctx.context, input);
  const sessions = await ctx.db.selectFrom('identities').select('identity_id').execute();

  expect(first).toMatchObject({ status: 'enrolled' });
  expect(retry).toMatchObject({ status: 'enrolled' });
  expect(sessions).toHaveLength(1);
});

test('it replaces the first token with the token a retry answers', async () => {
  const ctx = await setupTest();

  const issued = await createEnrolmentCode(ctx.context);
  const input = {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code,
    deviceName: 'laptop',
    tokenDelivery: 'bearer' as const,
  };
  const first = await claimEnrolmentCode(ctx.context, input);
  const retry = await claimEnrolmentCode(ctx.context, input);

  if (first.status !== 'enrolled' || retry.status !== 'enrolled') {
    throw new Error('an enrolment failed');
  }
  const callers = await Promise.all([
    verifySessionToken(ctx.context, first.token),
    verifySessionToken(ctx.context, retry.token),
  ]);

  expect(callers).toStrictEqual([null, expect.objectContaining({ identityID: first.sessionID })]);
});

test('it refuses a retry once the code it used has lapsed', async () => {
  const ctx = await setupTest();

  const issued = await createEnrolmentCode(ctx.context);
  const input = {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code,
    deviceName: 'laptop',
    tokenDelivery: 'bearer' as const,
  };

  await claimEnrolmentCode(ctx.context, input);
  ctx.clock.advance(15 * 60 * 1000);

  const result = await claimEnrolmentCode(ctx.context, input);

  expect(result).toStrictEqual({ status: 'invalid' });
});

test('it refuses a client action ID that came with a different device name', async () => {
  const ctx = await setupTest();

  const issued = await createEnrolmentCode(ctx.context);

  await claimEnrolmentCode(ctx.context, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code,
    deviceName: 'laptop',
    tokenDelivery: 'bearer',
  });

  const result = await claimEnrolmentCode(ctx.context, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code,
    deviceName: 'phone',
    tokenDelivery: 'bearer',
  });

  expect(result).toStrictEqual({ status: 'reused' });
});

test('it records the enrolment with the device name encrypted', async () => {
  const ctx = await setupTest();

  const issued = await createEnrolmentCode(ctx.context);
  const enrolled = await claimEnrolmentCode(ctx.context, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code,
    deviceName: 'laptop',
    tokenDelivery: 'bearer',
  });

  if (enrolled.status !== 'enrolled') {
    throw new Error('the enrolment failed');
  }
  const record = await ctx.db
    .$extendTables<{ records: { kind: string; payload: string; key_id: string | null } }>()
    .selectFrom('records')
    .select(['payload', 'key_id'])
    .where('kind', '=', 'session.enrolled')
    .executeTakeFirstOrThrow();

  expect(JSON.parse(record.payload)).toStrictEqual({
    identityID: enrolled.sessionID,
    channel: 'client',
    issuedBy: null,
  });
  expect(record.key_id).toBeString();
});
