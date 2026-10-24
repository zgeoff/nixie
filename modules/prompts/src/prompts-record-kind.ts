export type PromptsRecordKind =
  | 'prompts.override_proposed'
  | 'prompts.override_approved'
  | 'prompts.override_rejected'
  | 'prompts.override_lapsed';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<PromptsRecordKind, true> {}
}
