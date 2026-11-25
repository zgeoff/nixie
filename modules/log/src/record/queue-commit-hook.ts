import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { pendingCommitHooks } from './pending-commit-hooks';

// Queues a hook that runs once the write transaction has committed, and never when it rolls back.
export function queueCommitHook(tx: Transaction<unknown>, hook: () => void): void {
  const hooks = pendingCommitHooks.read(tx);

  invariant(hooks !== undefined, 'a commit hook needs a transaction from withWriteTransaction');

  hooks.push(hook);
}
