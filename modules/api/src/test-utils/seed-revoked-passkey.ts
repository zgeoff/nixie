import { withWriteTransaction } from '@heynixie/log';
import { updatePasskeyRevoked } from '../passkey/update-passkey-revoked';
import type { APIContext } from '../types';
import type { PasskeySeed, SeededPasskey } from './seed-passkey';
import { seedPasskey } from './seed-passkey';

// A passkey that the host has revoked, as `nixie passkeys revoke` leaves it.
export async function seedRevokedPasskey(
  context: APIContext,
  seed: PasskeySeed,
): Promise<SeededPasskey> {
  const seeded = await seedPasskey(context, seed);

  await withWriteTransaction(context.log.writer, (tx) =>
    updatePasskeyRevoked(tx, context, { passkeyID: seeded.passkeyID, revokedBy: 'host' }),
  );

  return seeded;
}
