export type SkillsRecordKind =
  | 'skills.pinned'
  | 'skills.reloaded'
  | 'skills.write_proposed'
  | 'skills.write_approved'
  | 'skills.write_rejected'
  | 'skills.write_lapsed'
  | 'skills.written_resolved';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<SkillsRecordKind, true> {}
}
