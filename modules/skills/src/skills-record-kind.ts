// The record kinds the skills module registers with the log: the skill versions a task pins, a
// reload that moves the pin on, a skill that nixie proposes to write, and the approval, the
// rejection or the lapse that closes the proposal.
export type SkillsRecordKind =
  | 'skills.pinned'
  | 'skills.reloaded'
  | 'skills.write_proposed'
  | 'skills.write_approved'
  | 'skills.write_rejected'
  | 'skills.write_lapsed';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<SkillsRecordKind, true> {}
}
