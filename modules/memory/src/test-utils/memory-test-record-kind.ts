// The record kinds the memory test utils write: the stub gate's stand-in for a held write's record,
// and filler that pushes a log past a page. Each package that loads these test utils sees them.
export type MemoryTestRecordKind = 'test.proposal' | 'test.filler';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<MemoryTestRecordKind, true> {}
}
