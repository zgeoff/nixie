// The memory module owns this kind, and the backup module does not depend on it. The merge lets the
// backup tests write it through the log's writer, as the memory forget does.
export type BackupTestRecordKind = 'memory.forgotten';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<BackupTestRecordKind, true> {}
}
