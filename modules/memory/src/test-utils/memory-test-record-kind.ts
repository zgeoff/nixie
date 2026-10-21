export type MemoryTestRecordKind = 'test.proposal' | 'test.filler';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<MemoryTestRecordKind, true> {}
}
