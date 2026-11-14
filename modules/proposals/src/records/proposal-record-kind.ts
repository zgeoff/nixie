export type ProposalRecordKind =
  | 'proposals.deferred'
  | 'proposals.returned'
  | 'proposals.withdrawn';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<ProposalRecordKind, true> {}
}
