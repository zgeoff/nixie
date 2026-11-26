// The task run holds a sandbox whose count has no read at the task run's end yet. The caller reads
// it outside the transaction, then ends the task run again.
export class RunEndUnsettledError extends Error {
  override readonly name = 'RunEndUnsettledError';

  readonly taskID: string;

  constructor(taskID: string, runID: string) {
    super(`the task run ${runID} of task ${taskID} has a sandbox with no read at its end`);

    this.taskID = taskID;
  }
}
