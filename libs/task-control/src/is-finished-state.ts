const finishedStates: ReadonlySet<string> = new Set(['done', 'failed', 'closed']);

export function isFinishedState(state: string): boolean {
  return finishedStates.has(state);
}
