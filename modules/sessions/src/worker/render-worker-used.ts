import type { WorkerUsed } from './worker-used';

export function renderWorkerUsed(used: WorkerUsed): string {
  const minutes = used.minutes.toFixed(1);
  const dollars = used.dollars.toFixed(2);

  return `It used ${minutes} minutes, ${String(used.turns)} turns, ${String(used.tokens)} tokens and $${dollars}.`;
}
