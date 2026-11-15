// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { withWriteTransaction } from '@heynixie/log';
import { createPasskeyCode } from '../passkey/create-passkey-code';
import { readAllPasskeys } from '../passkey/read-all-passkeys';
import { updatePasskeyRevoked } from '../passkey/update-passkey-revoked';
import type { APIContext, APITables } from '../types';
import { hostImplementer } from './host-implementer';

export function createHostPasskeyProcedures(context: APIContext) {
  const passkeys = hostImplementer.passkeys;

  return {
    issueCode: passkeys.issueCode.handler(async () => {
      const issued = await createPasskeyCode(context);

      return { code: issued.code, expiresAt: issued.expiresAt };
    }),

    list: passkeys.list.handler(async () => {
      const rows = await readAllPasskeys(context.log.writer.db);

      return rows.map((row) => ({
        passkeyID: row.passkey_id,
        label: row.label,
        synced: row.backup_eligible === 1,
        origin: row.origin,
        registeredBy: row.registered_by,
        authorizedBy: row.authorized_by,
        registeredAt: new Date(row.registered_at),
        lastUsedAt: row.last_used_at === null ? null : new Date(row.last_used_at),
        revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at),
      }));
    }),

    revoke: passkeys.revoke.handler(async (options) => {
      const revokedAt = await withWriteTransaction(context.log.writer, async (tx) => {
        const known = await tx
          .$extendTables<APITables>()
          .selectFrom('passkeys')
          .select('passkey_id')
          .where('passkey_id', '=', options.input.passkeyID)
          .executeTakeFirst();

        if (known === undefined) {
          return null;
        }

        return updatePasskeyRevoked(tx, context, {
          passkeyID: options.input.passkeyID,
          revokedBy: 'host',
        });
      });

      if (revokedAt === null) {
        throw options.errors.PASSKEY_NOT_FOUND();
      }

      return { passkeyID: options.input.passkeyID, revokedAt: new Date(revokedAt) };
    }),
  };
}
