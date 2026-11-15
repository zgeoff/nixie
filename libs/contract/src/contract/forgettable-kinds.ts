// Every kind of record that carries its own text, except a moment's records and a memory item's
// records, which their own removals take. A kind that gains erasable fields joins this list, or
// one of the two exceptions, and a test holds each one to exactly one.
export const forgettableKinds = [
  'action.outcome',
  'action.queued',
  'action.retry_scheduled',
  'model.compaction_failed',
  'model.reply',
  'model.session_summarized',
  'owner_message',
  'policy.action_answered',
  'policy.action_proposed',
  'policy.contact_marked_known',
  'prompts.override_rejected',
  'proposals.deferred',
  'session.enrolled',
  'session.labelled',
  'session_kept',
  'skills.write_rejected',
  'task.created',
  'task.run_ended',
  'task.run_report_requested',
  'task.step_errored',
  'task_message',
  'tool_called',
  'tool_result',
] as const;
