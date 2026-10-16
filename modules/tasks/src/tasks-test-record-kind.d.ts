// The record kind the tasks tests write for a step's own output, which the modules above tasks
// register. This file reaches only the tasks package's own program.
export type TasksTestRecordKind = 'turn_finished';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<TasksTestRecordKind, true> {}
}
