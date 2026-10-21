export type ToolsRecordKind = 'tool_called' | 'tool_result';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<ToolsRecordKind, true> {}
}
