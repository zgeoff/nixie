export type RemindersRecordKind = 'reminder.set' | 'reminder.updated' | 'reminder.cancelled';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<RemindersRecordKind, true> {}
}
