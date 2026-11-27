export type PhoneRecordKind = 'phone.text_received' | 'phone.send_claimed';

type PhoneErasableRecordKind = 'phone.text_received';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<PhoneRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<PhoneErasableRecordKind, true> {}
}
