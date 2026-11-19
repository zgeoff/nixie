export type SkillsRecordKind =
  | 'skills.pinned'
  | 'skills.reloaded'
  | 'skills.write_proposed'
  | 'skills.write_approved'
  | 'skills.write_applied'
  | 'skills.write_rejected'
  | 'skills.write_lapsed'
  | 'skills.written_resolved';

type SkillsErasableRecordKind = 'skills.write_rejected';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<SkillsRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<SkillsErasableRecordKind, true> {}
}
