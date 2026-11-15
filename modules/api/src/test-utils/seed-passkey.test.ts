import { expect, test } from 'bun:test';
import { readAllPasskeys } from '../passkey/read-all-passkeys';
import { createDeviceSession } from './create-device-session';
import { seedPasskey } from './seed-passkey';
import { startTestAPI } from './start-test-api';

test('it registers one live passkey on the origin it is given, labelled for the session', async () => {
  const ctx = await startTestAPI();
  const session = await createDeviceSession(ctx.context, 'laptop');

  const seeded = await seedPasskey(ctx.context, {
    caller: session.caller,
    origin: 'https://assistant.example.net',
  });

  const rows = await readAllPasskeys(ctx.context.log.writer.db);

  expect(
    rows.map((row) => [row.passkey_id, row.origin, row.rp_id, row.label, row.revoked_at]),
  ).toStrictEqual([
    [seeded.passkeyID, 'https://assistant.example.net', 'assistant.example.net', 'laptop', null],
  ]);
});
