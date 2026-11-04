interface ThreadPage {
  readonly lastStepEnd?: { readonly sequence: number } | null;
}

// A task can report through a task message and commit with no text reply, and the spike reads a
// task's thread only after the task is new, so any step end there is the task's own.
export function isTaskStepEnded(page: ThreadPage): boolean {
  return page.lastStepEnd !== null && page.lastStepEnd !== undefined;
}
