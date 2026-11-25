export type MailRecordKind = 'mail.received' | 'mail.sent' | 'mail.marked_read';

type MailErasableRecordKind = 'mail.received' | 'mail.sent';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<MailRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<MailErasableRecordKind, true> {}
}
