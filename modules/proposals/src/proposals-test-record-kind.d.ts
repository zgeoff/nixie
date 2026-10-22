export type ProposalsTestRecordKind =
  | 'test.proposal_approved'
  | 'test.proposal_rejected'
  | 'test.proposal_lapsed';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<ProposalsTestRecordKind, true> {}
}
