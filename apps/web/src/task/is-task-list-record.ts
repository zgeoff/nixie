// The tasks projection moves a task's last activity on each of these records and on every inbox
// record, so the dashboard reads the list again on each of them.
const listedKinds: ReadonlySet<string> = new Set([
  'log_reset',
  'owner_message',
  'task_message',
  'timer.fired',
]);

export function isTaskListRecord(kind: string): boolean {
  return listedKinds.has(kind) || kind.startsWith('task.') || kind.startsWith('action.');
}
