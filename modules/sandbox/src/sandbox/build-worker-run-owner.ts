import { workerRunOwnerPrefix } from './worker-run-owner-prefix';

export function buildWorkerRunOwner(workerRunID: string): string {
  return `${workerRunOwnerPrefix}${workerRunID}`;
}
