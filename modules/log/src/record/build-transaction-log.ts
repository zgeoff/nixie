import type { Transaction } from 'kysely';
import type { Log } from '../types';

// A log whose database handle is one write transaction, so a read sees what the transaction sees.
export function buildTransactionLog<Source extends Pick<Log, 'deploymentKey' | 'writer'>>(
  log: Source,
  tx: Transaction<unknown>,
): Source {
  return { ...log, writer: { ...log.writer, db: tx } };
}
