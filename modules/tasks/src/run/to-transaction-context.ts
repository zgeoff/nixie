import type { Transaction } from 'kysely';
import type { TasksContext } from '../types';

// A reader of the log takes the writer's handle, and inside a write transaction the same handle
// would wait for the transaction, so the readers go through the transaction instead.
export function toTransactionContext<Context extends Pick<TasksContext, 'log'>>(
  context: Context,
  tx: Transaction<unknown>,
): Context {
  return { ...context, log: { ...context.log, writer: { ...context.log.writer, db: tx } } };
}
