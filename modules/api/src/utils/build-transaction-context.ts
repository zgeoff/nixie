import type { Transaction } from 'kysely';
import type { APIContext } from '../types';

// The context with its database handle on the transaction, so the reads of a start see what the
// start transaction wrote and see no other writer.
export function buildTransactionContext(context: APIContext, tx: Transaction<unknown>): APIContext {
  return { ...context, log: { ...context.log, writer: { ...context.log.writer, db: tx } } };
}
