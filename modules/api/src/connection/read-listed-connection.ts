import type { ListedConnection } from '@heynixie/connections';
import type { APIContext } from '../types';
import { readContractForgetStatus } from './read-contract-forget-status';

// One connection of the list as the contract shows it: its dates as dates, and its forget, when it
// has one, with the backup state beside the erasure and the revocation.
export async function readListedConnection(context: APIContext, entry: ListedConnection) {
  const forget =
    entry.forget === null ? null : await readContractForgetStatus(context, entry.forget);

  return {
    connection: entry.connection,
    connector: entry.connector,
    label: entry.label,
    account: entry.account,
    status: entry.status,
    reason: entry.reason,
    statusSince: new Date(entry.statusSince),
    lastSuccessAt: entry.lastSuccessAt === null ? null : new Date(entry.lastSuccessAt),
    scopes: [...entry.scopes],
    missing: [...entry.missing],
    fingerprint: entry.fingerprint,
    forget,
  };
}
