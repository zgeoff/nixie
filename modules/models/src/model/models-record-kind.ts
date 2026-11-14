export type ModelsRecordKind =
  | 'model.reply'
  | 'model.turn_ended'
  | 'model.compacted'
  | 'model.compaction_failed'
  | 'model.session_opened'
  | 'model.session_rebuilt'
  | 'model.session_invalidated'
  | 'model.session_summarized'
  | 'model.session_cleanup_completed';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<ModelsRecordKind, true> {}
}
