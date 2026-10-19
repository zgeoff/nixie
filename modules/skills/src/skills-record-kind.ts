// The record kinds the skills module registers with the log: the skill versions a task pins.
export type SkillsRecordKind = 'skills.pinned';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<SkillsRecordKind, true> {}
}
