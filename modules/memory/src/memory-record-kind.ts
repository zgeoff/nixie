export type MemoryRecordKind =
  | 'memory.approval_recorded'
  | 'memory.batch_planned'
  | 'memory.batch_published'
  | 'memory.consolidation_approved'
  | 'memory.consolidation_commented'
  | 'memory.consolidation_lapsed'
  | 'memory.consolidation_proposed'
  | 'memory.consolidation_rejected'
  | 'memory.consolidation_summarized'
  | 'memory.forget_started'
  | 'memory.forgotten'
  | 'memory.image_offered'
  | 'memory.notice'
  | 'memory.pinned'
  | 'memory.proposal_lapsed'
  | 'memory.proposal_merged'
  | 'memory.proposal_rejected'
  | 'memory.proposal_self_noted'
  | 'memory.proposal_shared_noted'
  | 'memory.proposed'
  | 'memory.rated'
  | 'memory.self_note_flagged'
  | 'memory.self_noted'
  | 'memory.shared_noted'
  | 'memory.version_added'
  | 'memory.writer_failed'
  | 'memory.writer_started'
  | 'record.forget_started'
  | 'record.forgotten';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<MemoryRecordKind, true> {}
}
