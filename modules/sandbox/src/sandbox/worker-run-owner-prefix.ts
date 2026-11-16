// A worker run owns its sandbox under this prefix and its own UUID, never under its caller's task
// ID, because a task's sandbox helper destroys the other sandboxes of its owner.
export const workerRunOwnerPrefix = 'worker_run:';
