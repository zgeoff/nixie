export type McpRecordKind =
  | 'mcp.proposed'
  | 'mcp.answered'
  | 'mcp.lapsed'
  | 'mcp.server_changed'
  | 'mcp.tool_listed'
  | 'mcp.tool_changed'
  | 'mcp.pin_moved'
  | 'mcp.notice';

// The tool form of a listing is the server's text, so it sits in the record's erasable fields.
type McpErasableRecordKind = 'mcp.tool_listed';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<McpRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<McpErasableRecordKind, true> {}
}
