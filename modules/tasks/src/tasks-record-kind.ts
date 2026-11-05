export type TasksRecordKind =
  | 'task.created'
  | 'task.revived'
  | 'task.step_started'
  | 'task.step_committed'
  | 'task.step_errored'
  | 'task.step_interrupted'
  | 'task.lease_expired'
  | 'task.pause_requested'
  | 'task.paused'
  | 'task.resumed'
  | 'task.stopped'
  | 'task.restarted'
  | 'task.closed'
  | 'task.interrupted'
  | 'task.limit_reached'
  | 'task.limit_notice'
  | 'task.limits_raised'
  | 'task.wake'
  | 'task_message'
  | 'task.exchange_limited'
  | 'timer.fired'
  | 'owner_message'
  | 'action.outcome';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<TasksRecordKind, true> {}
}
