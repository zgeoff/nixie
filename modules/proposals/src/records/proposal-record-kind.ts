export type ProposalRecordKind =
  | 'proposals.proposed'
  | 'proposals.settled'
  | 'proposals.deferred'
  | 'proposals.returned'
  | 'proposals.proposer_left'
  | 'proposals.withdrawn';

type ProposalErasableRecordKind = 'proposals.deferred' | 'proposals.settled';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<ProposalRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<ProposalErasableRecordKind, true> {}
}
