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
  | 'task.mark_set'
  | 'task.definition_set'
  | 'trigger.fired'
  | 'trigger.skipped'
  | 'trigger.task_input'
  | 'task.interrupted'
  | 'task.limit_reached'
  | 'task.failed_turn_spent'
  | 'task.limit_notice'
  | 'recovery.notice'
  | 'task.limits_raised'
  | 'task.wake'
  | 'task.run_opened'
  | 'task.run_report_requested'
  | 'task.run_ended'
  | 'task_message'
  | 'task.exchange_limited'
  | 'task.message_refused'
  | 'timer.fired'
  | 'owner_message'
  | 'action.outcome';

type TasksErasableRecordKind =
  | 'action.outcome'
  | 'owner_message'
  | 'task.created'
  | 'task.run_ended'
  | 'task.run_report_requested'
  | 'task.step_errored'
  | 'task_message'
  | 'trigger.task_input';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<TasksRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<TasksErasableRecordKind, true> {}
}
