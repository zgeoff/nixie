export type APIRecordKind =
  | 'session.enrolled'
  | 'session.labelled'
  | 'session.revoked'
  | 'session_kept'
  | 'enrolment_code.issued'
  | 'identity.refused';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<APIRecordKind, true> {}
}
