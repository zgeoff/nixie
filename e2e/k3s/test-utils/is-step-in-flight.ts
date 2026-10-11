// Tells whether a step of the thread has started and not yet ended, from the thread's records: the
// last step record is a start, with no commit, error or interruption after it.
export function isStepInFlight(records: readonly { readonly kind: string }[]): boolean {
  const last = records.findLast((record) => stepKinds.has(record.kind));

  return last?.kind === 'task.step_started';
}

const stepKinds: ReadonlySet<string> = new Set([
  'task.step_started',
  'task.step_committed',
  'task.step_errored',
  'task.step_interrupted',
]);
