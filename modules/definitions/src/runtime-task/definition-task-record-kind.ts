export type DefinitionTaskRecordKind =
  | 'definition.changed'
  | 'definition.settled'
  | 'definition.repo_moved'
  | 'definition.conflict_resolved'
  | 'definition.export_moved';

type DefinitionTaskErasableRecordKind = 'definition.changed';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<DefinitionTaskRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<DefinitionTaskErasableRecordKind, true> {}
}
