import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { probeLiveIdentity } from './probe-live-identity';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';

function setupTest() {
  return startTestAPI();
}

test('it finds a session live while it is neither revoked nor lapsed', async () => {
  const ctx = await setupTest();
  const session = await createDeviceSession(ctx.context, 'laptop');

  const live = await withWriteTransaction(ctx.writer, (tx) =>
    probeLiveIdentity(tx, ctx.context, session.sessionID),
  );

  expect(live).toBeTrue();
});

test('it finds a revoked session not live', async () => {
  const ctx = await setupTest();
  const session = await createDeviceSession(ctx.context, 'laptop');

  await ctx.writer.db
    .$extendTables<APITables>()
    .updateTable('identities')
    .set({ revoked_at: 1_000_000 })
    .execute();

  const live = await withWriteTransaction(ctx.writer, (tx) =>
    probeLiveIdentity(tx, ctx.context, session.sessionID),
  );

  expect(live).toBeFalse();
});

test('it finds a lapsed session not live', async () => {
  const ctx = await setupTest();
  const session = await createDeviceSession(ctx.context, 'laptop');

  ctx.clock.advance(30 * 24 * 60 * 60 * 1000 + 1);

  const live = await withWriteTransaction(ctx.writer, (tx) =>
    probeLiveIdentity(tx, ctx.context, session.sessionID),
  );

  expect(live).toBeFalse();
});
