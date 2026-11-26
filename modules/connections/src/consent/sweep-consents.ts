import { readRecordKeys, withWriteTransaction } from '@heynixie/log';
import { removeKey } from '../backend/mint-key';
import { openConnectionValues } from '../connection/open-connection-values';
import type { ServiceContext } from '../service-context';
import type { ConnectionTables } from '../types';
import { discardConsent } from './discard-consent';
import { probeLiveAccount } from './probe-live-account';

export interface SweptConsents {
  readonly requests: number;
  readonly credentials: number;
}

// Deletes each request that lapsed or lost its key, with its key. It also ends a consent's own credential that no
// finished consent claimed, which only a crash after the exchange leaves, and revokes its token.
export async function sweepConsents(context: ServiceContext): Promise<SweptConsents> {
  const nowMs = context.now();
  const tables = context.log.writer.db.$extendTables<ConnectionTables>();

  const requests = await tables.selectFrom('consent_requests').selectAll().execute();

  const keys = await readRecordKeys(context.log, [
    ...new Set(requests.map((request) => request.key_id)),
  ]);

  // a request whose key is gone, such as after a crash that followed the key's deletion, can never
  // be claimed, so it goes with the lapsed ones
  const lapsed = requests.filter(
    (request) => request.expires_at <= nowMs || !keys.has(request.key_id),
  );

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
    .selectAll()
    .where('connector_id', '=', context.connector.id)
    .where('token_fingerprint', 'is', null)
    .where('binding', '=', 'enabled')
    .where('created_at', '<=', nowMs - context.consentLifetimeMs)
    .execute();

  const opened = await openConnectionValues(context.log, orphans);

  for (const orphan of orphans) {
    const subject = opened.get(orphan.connection_id)?.account?.subject ?? null;

    await discardConsent(context, {
      consentID: '',
      credentialID: orphan.connection_id,
      reason: 'no_account',
      isRevoked: !(await probeLiveAccount(context, orphan.connection_id, subject)),
    });
  }

  return { requests: lapsed.length, credentials: orphans.length };
}
