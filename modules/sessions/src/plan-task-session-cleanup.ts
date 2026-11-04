export interface TaskSessionFacts {
  readonly isOpened: boolean;
  readonly hasSandbox: boolean;
}

export interface TaskSessionCleanupPlan {
  readonly isInvalidated: boolean;
  readonly isPurged: boolean;
}

// A task that never opened a session has none to invalidate, and an invalidation would turn its
// first start into a wait. Its guest can still hold a first turn that a forget aborted, so any
// sandbox it has is purged.
export function planTaskSessionCleanup(facts: TaskSessionFacts): TaskSessionCleanupPlan {
  return { isInvalidated: facts.isOpened, isPurged: facts.hasSandbox };
}
