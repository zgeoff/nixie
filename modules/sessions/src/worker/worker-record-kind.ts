export type WorkerRecordKind =
  | 'worker.run_started'
  | 'worker.turn_ended'
  | 'worker.gateway_charged'
  | 'worker.run_ended';

type WorkerErasableRecordKind = 'worker.turn_ended' | 'worker.run_ended';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<WorkerRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<WorkerErasableRecordKind, true> {}
}
