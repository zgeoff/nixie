// The tool names the conversation's run lists: each tool of the server itself, and `<server>.*` for
// each configured MCP server, which holds the tools the server exposes at the time of a request.
export function collectConversationToolNames(
  toolNames: readonly string[],
  serverIDs: readonly string[],
): string[] {
  return [...toolNames, ...serverIDs.map((serverID) => `${serverID}.*`)];
}
