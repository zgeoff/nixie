import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { clientRemovedCodec } from '../record/client-removed-codec';
import type { ServiceContext } from '../service-context';
import type { ConnectionTables, OperationAttempt, RemoveClientResult } from '../types';
import { readClientByShortID } from './read-client-by-short-id';

// Removes the client: its secret and its key go. Google keeps the client until the owner deletes it
// in the console, so nothing is revoked. A client that a live connection or an unlapsed consent
// request names stays. A retry whose removal committed without its record writes the record.
export function removeClient(
  context: ServiceContext,
  shortID: string,
  attempt?: OperationAttempt<RemoveClientResult>,
): Promise<RemoveClientResult> {
  return context.lock.withLock(async () => {
    const client = await readClientByShortID(context, shortID);

    if (client === null) {
      const isRemoved =
        attempt?.isRetry === true ? await probeRemovedClient(context, shortID) : false;

      return isRemoved
        ? writeRemoval(context, shortID, attempt)
        : settleRefusal(context, { kind: 'client_not_found' }, attempt);
    }

    const tables = context.log.writer.db.$extendTables<ConnectionTables>();

    const connection = await tables
      .selectFrom('connections')
      .select('connection_id')
      .where('oauth_client_id', '=', client.oauth_client_id)
      .where('binding', '!=', 'removed')
      .executeTakeFirst();

    const consent = await tables
      .selectFrom('consent_requests')
      .select('consent_id')
      .where('oauth_client_id', '=', client.oauth_client_id)
      .where('expires_at', '>', context.now())
      .executeTakeFirst();

    if (connection !== undefined || consent !== undefined) {
      return settleRefusal(context, { kind: 'client_in_use' }, attempt);
    }

    await context.store.remove({ backend: 'database', credentialID: client.oauth_client_id });

    return writeRemoval(context, shortID, attempt);
  });
}

async function probeRemovedClient(context: ServiceContext, shortID: string): Promise<boolean> {
  const removed = await context.log.writer.db
    .$extendTables<ConnectionTables>()
    .selectFrom('oauth_clients')
    .select('oauth_client_id')
    .where('short_id', '=', shortID)
    .where('removed_at', 'is not', null)
    .executeTakeFirst();

  return removed !== undefined;
}

function writeRemoval(
  context: ServiceContext,
  shortID: string,
  attempt: OperationAttempt<RemoveClientResult> | undefined,
): Promise<RemoveClientResult> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: clientRemovedCodec.kind,
        definitions: context.definitions(),
        payload: clientRemovedCodec.encode({ client: shortID }),
      },
    ]);

    await attempt?.settle(tx, { kind: 'ok' });

    return { kind: 'ok' } as const;
  });
}

async function settleRefusal(
  context: ServiceContext,
  result: RemoveClientResult,
  attempt: OperationAttempt<RemoveClientResult> | undefined,
): Promise<RemoveClientResult> {
  if (attempt !== undefined) {
    await withWriteTransaction(context.log.writer, (tx) => attempt.settle(tx, result));
  }

  return result;
}
