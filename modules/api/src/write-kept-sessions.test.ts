import { expect, test } from 'bun:test';
import { readRecords, runLogReset } from '@heynixie/log';
import { sql } from 'kysely';
import { readKeptSessions } from './read-kept-sessions';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import { verifySessionToken } from './verify-session-token';
import { writeKeptSessions } from './write-kept-sessions';
import { writeSessionRevocation } from './write-session-revocation';

function setupTest() {
  return startTestAPI();
}

test('it keeps a live session signed in across a reset', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  await runLogReset(ctx.context.log, {
    keptTables: ['identities'],
    readKept: (tx) => readKeptSessions(tx, ctx.context),
    writeFirstRecords: (tx, sessions) =>
      writeKeptSessions(tx, ctx.context.log, {
        sessions,
        definitions: { snapshotHash: 'sha256:test' },
      }),
  });

  const caller = await verifySessionToken(ctx.context, laptop.token);

  expect(caller?.identityID).toBe(laptop.sessionID);
});

test('it writes a session_kept record for each kept session and points the session at it', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  await runLogReset(ctx.context.log, {
    keptTables: ['identities'],
    readKept: (tx) => readKeptSessions(tx, ctx.context),
    writeFirstRecords: (tx, sessions) =>
      writeKeptSessions(tx, ctx.context.log, {
        sessions,
        definitions: { snapshotHash: 'sha256:test' },
      }),
  });

  const read = await readRecords(ctx.context.log, { afterSequence: 0 });
  const identities = await sql`select paired_sequence from identities`.execute(ctx.writer.db);

  const kept = read.at(0)?.record;

  expect(kept).toMatchObject({
    kind: 'session_kept',
    thread: null,
    definitions: { snapshotHash: 'sha256:test' },
    payload: { sessionID: laptop.sessionID, channel: 'client', pairedAt: 1_000_000 },
    erasable: { status: 'readable', fields: { label: 'laptop' } },
  });

  expect(identities.rows).toStrictEqual([{ paired_sequence: kept?.sequence }]);
});

test('it refuses a revoked token as a stranger after a reset', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const phone = await createDeviceSession(ctx.context, 'phone');

  await writeSessionRevocation(ctx.context, laptop.caller, {
    clientActionID: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    sessionID: phone.sessionID,
  });

  await runLogReset(ctx.context.log, {
    keptTables: ['identities'],
    readKept: (tx) => readKeptSessions(tx, ctx.context),
    writeFirstRecords: (tx, sessions) =>
      writeKeptSessions(tx, ctx.context.log, {
        sessions,
        definitions: { snapshotHash: 'sha256:test' },
      }),
  });

  const caller = await verifySessionToken(ctx.context, phone.token);

  const read = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['identity.refused'],
  });

  expect(caller).toBeNull();

  expect(read.map((entry) => entry.record.payload)).toStrictEqual([
    { channel: 'client', externalID: 'unknown-token', refusedAt: 1_000_000 },
  ]);
});

test('it removes a lapsed session', async () => {
  const ctx = await setupTest();

  await createDeviceSession(ctx.context, 'laptop');

  ctx.clock.advance(30 * 24 * 60 * 60 * 1000 + 1);

  await runLogReset(ctx.context.log, {
    keptTables: ['identities'],
    readKept: (tx) => readKeptSessions(tx, ctx.context),
    writeFirstRecords: (tx, sessions) =>
      writeKeptSessions(tx, ctx.context.log, {
        sessions,
        definitions: { snapshotHash: 'sha256:test' },
      }),
  });

  const identities = await sql`select identity_id from identities`.execute(ctx.writer.db);

  expect(identities.rows).toStrictEqual([]);
});
