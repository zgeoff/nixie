export type ImagesRecordKind = 'image.named' | 'image.pinned' | 'image.unpinned';

type ImagesErasableRecordKind = 'image.named';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<ImagesRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<ImagesErasableRecordKind, true> {}
}
