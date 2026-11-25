export type CredentialRecordKind =
  | 'credential.refresh_started'
  | 'credential.refresh_saved'
  | 'credential.refresh_failed'
  | 'credential.refresh_discarded'
  | 'credential.refresh_lost'
  | 'credential.status_changed';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<CredentialRecordKind, true> {}
}
