export type ComputerTakeoverRecordKind = 'computer.takeover_started' | 'computer.takeover_ended';

type ComputerTakeoverErasableRecordKind = 'computer.takeover_ended';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<ComputerTakeoverRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<ComputerTakeoverErasableRecordKind, true> {}
}
