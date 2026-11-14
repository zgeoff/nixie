export function buildTaskHref(taskID: string): string {
  return taskID === 'conversation' ? '/' : `/tasks/${encodeURIComponent(taskID)}`;
}
