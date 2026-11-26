import type { WorkerUsed } from './worker-used';

export function renderWorkerUsed(used: WorkerUsed): string {
  const minutes = used.minutes.toFixed(1);

  return `It used ${minutes} minutes, ${String(used.turns)} turns and ${String(used.tokens)} tokens.`;
}
