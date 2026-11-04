export function findNewTaskID(
  knownIDs: readonly string[],
  tasks: readonly { readonly taskID: string }[],
): string | undefined {
  return tasks.find((task) => !knownIDs.includes(task.taskID))?.taskID;
}
