import { expect, test } from 'bun:test';
import { readAllPasskeys } from '../passkey/read-all-passkeys';
import { createDeviceSession } from './create-device-session';
import { seedRevokedPasskey } from './seed-revoked-passkey';
import { startTestAPI } from './start-test-api';

test('it leaves a passkey that the host revoked', async () => {
  const ctx = await startTestAPI();
  const session = await createDeviceSession(ctx.context, 'laptop');
  const seeded = await seedRevokedPasskey(ctx.context, { caller: session.caller });
  const rows = await readAllPasskeys(ctx.context.log.writer.db);

  expect(rows.map((row) => [row.passkey_id, row.revoked_at])).toStrictEqual([
    [seeded.passkeyID, expect.any(Number)],
  ]);
});
