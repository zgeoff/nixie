import { workerRunOwnerPrefix } from './worker-run-owner-prefix';

// the UUID of the worker run that owns a sandbox, or null for any other owner
export function findWorkerRunID(owner: string): string | null {
  return owner.startsWith(workerRunOwnerPrefix) ? owner.slice(workerRunOwnerPrefix.length) : null;
}
