// The record kinds the actions module registers with the log. The outcome is an inbox kind, so the
// tasks module registers it.
export type ActionsRecordKind =
  | 'action.queued'
  | 'action.attempt_started'
  | 'action.retry_scheduled';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<ActionsRecordKind, true> {}
}
