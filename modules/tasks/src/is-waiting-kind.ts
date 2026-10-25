import type { TaskMessageKind } from './types';

const waitingKinds: ReadonlySet<TaskMessageKind> = new Set(['question', 'request']);

export function isWaitingKind(kind: TaskMessageKind): boolean {
  return waitingKinds.has(kind);
}
