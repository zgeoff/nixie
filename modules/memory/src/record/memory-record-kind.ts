export type MemoryRecordKind =
  | 'memory.approval_recorded'
  | 'memory.forget_started'
  | 'memory.forgotten'
  | 'memory.image_offered'
  | 'memory.pinned'
  | 'memory.proposal_lapsed'
  | 'memory.proposal_merged'
  | 'memory.proposal_rejected'
  | 'memory.proposal_self_noted'
  | 'memory.proposal_sensitive_noted'
  | 'memory.proposal_shared_noted'
  | 'memory.proposal_subject_changed'
  | 'memory.proposed'
  | 'memory.rated'
  | 'memory.self_noted'
  | 'memory.sensitive_marked'
  | 'memory.shared_noted'
  | 'memory.subject_changed'
  | 'memory.version_added'
  | 'moment_destroyed'
  | 'moment_edited'
  | 'moment_kept'
  | 'moment_linked'
  | 'moment_retired'
  | 'record.forget_started'
  | 'record.forgotten';

export type MemoryErasableRecordKind =
  | 'memory.image_offered'
  | 'memory.proposal_rejected'
  | 'moment_edited'
  | 'moment_kept';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<MemoryRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<MemoryErasableRecordKind, true> {}
}
