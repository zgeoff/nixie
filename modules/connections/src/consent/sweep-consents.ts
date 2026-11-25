import { withWriteTransaction } from '@heynixie/log';
import { removeKey } from '../backend/mint-key';
import type { ServiceContext } from '../service-context';
import type { ConnectionTables } from '../types';
import { discardConsent } from './discard-consent';

export interface SweptConsents {
  readonly requests: number;
  readonly credentials: number;
}

// Deletes each request that lapsed, with its key. It also ends a consent's own credential that no
// finished consent claimed, which only a crash after the exchange leaves, and revokes its token.
export async function sweepConsents(context: ServiceContext): Promise<SweptConsents> {
  const nowMs = context.now();
  const tables = context.log.writer.db.$extendTables<ConnectionTables>();

  const requests = await tables.selectFrom('consent_requests').selectAll().execute();

  const lapsed = requests.filter((request) => request.expires_at <= nowMs);

  for (const request of lapsed) {
    await removeKey(context.backend.shared, request.key_id);

    await withWriteTransaction(context.log.writer, (tx) =>
      tx
        .$extendTables<ConnectionTables>()
        .deleteFrom('consent_requests')
        .where('consent_id', '=', request.consent_id)
        .execute(),
    );
  }

  // A credential made before the consent's lifetime ended and still unfinished after it is abandoned:
  // the exchange runs inside that lifetime.
  const orphans = await tables
    .selectFrom('connections')
    .select(['connection_id', 'created_at'])
    .where('token_fingerprint', 'is', null)
    .where('binding', '=', 'enabled')
    .where('created_at', '<=', nowMs - context.consentLifetimeMs)
    .execute();

  for (const orphan of orphans) {
    await discardConsent(context, {
      consentID: '',
      credentialID: orphan.connection_id,
      reason: 'no_account',
      isRevoked: true,
    });
  }

  return { requests: lapsed.length, credentials: orphans.length };
}
