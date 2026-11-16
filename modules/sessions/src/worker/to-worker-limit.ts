import { match } from 'ts-pattern';

export type WorkerLimit = 'minutes' | 'turns' | 'tokens' | 'dollars' | 'unknown';

// A release that adds a limit stores a string this one does not know, which reads as unknown.
export function toWorkerLimit(stored: string): WorkerLimit {
  return match(stored)
    .returnType<WorkerLimit>()
    .with('minutes', 'turns', 'tokens', 'dollars', (limit) => limit)
    .otherwise(() => 'unknown');
}
