export type ProposalRecordKind =
  | 'proposals.deferred'
  | 'proposals.returned'
  | 'proposals.withdrawn';

export type ProposalErasableRecordKind = 'proposals.deferred';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<ProposalRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<ProposalErasableRecordKind, true> {}
}
