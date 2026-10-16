// The record kinds the definitions module registers with the log.
export type DefinitionsRecordKind = 'definitions_seeded';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<DefinitionsRecordKind, true> {}
}
