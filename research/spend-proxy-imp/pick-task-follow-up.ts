export type TaskFollowUp =
  | { readonly kind: 'no-task' }
  | { readonly kind: 'wait-for-task'; readonly taskID: string };

// the task a turn starts is the one task that was not there before it, so a task an earlier spike
// started never stands in for it
export function pickTaskFollowUp(
  knownIDs: readonly string[],
  tasks: readonly { readonly taskID: string }[],
): TaskFollowUp {
  const taskID = tasks.find((task) => !knownIDs.includes(task.taskID))?.taskID;

  return taskID === undefined ? { kind: 'no-task' } : { kind: 'wait-for-task', taskID };
}
