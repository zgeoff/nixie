export type ActionsRecordKind =
  | 'action.queued'
  | 'action.attempt_started'
  | 'action.retry_scheduled'
  | 'action.reconcile_scheduled'
  | 'action.reconcile_checked'
  | 'action.held'
  | 'action.released'
  | 'action.unknown_answered';

type ActionsErasableRecordKind =
  | 'action.queued'
  | 'action.retry_scheduled'
  | 'action.reconcile_checked';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<ActionsRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<ActionsErasableRecordKind, true> {}
}
