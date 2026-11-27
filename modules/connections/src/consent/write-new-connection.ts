import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { ConnectionAccount } from '../connection/open-connection-values';
import { sealConnectionValues } from '../connection/open-connection-values';
import { writeAddressVersion } from '../connection/write-address-version';
import { connectedCodec } from '../record/connected-codec';
import type { ServiceContext } from '../service-context';
import type { ConnectionMissingScope, ConnectionRow, ConnectionTables } from '../types';

export interface FinishedConsent {
  // the consent's own credential, which holds the token the exchange saved
  readonly credential: ConnectionRow;
  readonly consentID: string;
  readonly account: ConnectionAccount;
  readonly scopes: readonly string[];
  readonly missing: readonly ConnectionMissingScope[];
  readonly refreshExpiresAtMs: number | null;
  readonly fingerprint: string;
}

// Keeps the consent's credential as a new connection: the account and the label sealed under its
// key, the scopes, and the fingerprint that makes it a connection. The request goes in the same
// transaction as the record. Answers `stale` when a forget took the credential first.
export async function writeNewConnection(
  context: ServiceContext,
  finished: FinishedConsent,
  label: string,
): Promise<'written' | 'stale'> {
  const sealed = await sealConnectionValues(context.log, finished.credential, {
    account: finished.account,
    label,
  });

  if (sealed === null || sealed.label === null) {
    return 'stale';
  }

  const sealedLabel = sealed.label;

  return withWriteTransaction(context.log.writer, async (tx) => {
    const tables = tx.$extendTables<ConnectionTables>();

    const updated = await tables
      .updateTable('connections')
      .set({
        account_sealed: sealed.account,
        label_sealed: sealedLabel,
        granted_scopes: JSON.stringify(finished.scopes),
        missing_scopes: JSON.stringify(finished.missing),
        refresh_expires_at: finished.refreshExpiresAtMs,
        token_fingerprint: finished.fingerprint,
      })
      .where('connection_id', '=', finished.credential.connection_id)
      .where('binding', '=', 'enabled')
      .where('removal_counter', '=', finished.credential.removal_counter)
      .executeTakeFirst();

    if (updated.numUpdatedRows === 0n) {
      return 'stale' as const;
    }

    await tables
      .deleteFrom('consent_requests')
      .where('consent_id', '=', finished.consentID)
      .execute();

    await writeAddressVersion(tx, {
      addressRef: finished.credential.connection_id,
      connectionID: finished.credential.connection_id,
      accountSealed: sealed.account,
      createdAt: context.now(),
    });

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: connectedCodec.kind,
        definitions: context.definitions(),
        payload: connectedCodec.encode({
          connection: finished.credential.connection_id,
          shortID: finished.credential.short_id,
          scopes: [...finished.scopes],
          missing: [...finished.missing],
          fingerprint: finished.fingerprint,
          again: false,
        }),
      },
    ]);

    return 'written' as const;
  });
}
