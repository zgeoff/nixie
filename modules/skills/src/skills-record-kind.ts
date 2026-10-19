// The record kinds the skills module registers with the log: the skill versions a task pins, a
// reload that moves the pin on, and a skill that nixie proposes to write.
export type SkillsRecordKind = 'skills.pinned' | 'skills.reloaded' | 'skills.write_proposed';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<SkillsRecordKind, true> {}
}
