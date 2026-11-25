// The earliest time that a listed task changes with no write: the next run of a task that wakes on a
// schedule. A run that is due already moves the task when it starts, which writes a record, so only
// a later time counts. The list holds no such time when no listed task has one.
export function pickListChangesAt(
  tasks: readonly { readonly nextRunAt?: string | undefined }[],
  nowMs: number,
): Date | null {
  const upcomingMs = tasks
    .map((task) => (task.nextRunAt === undefined ? Number.NaN : Date.parse(task.nextRunAt)))
    .filter((runMs) => runMs > nowMs);

  return upcomingMs.length === 0 ? null : new Date(Math.min(...upcomingMs));
}
