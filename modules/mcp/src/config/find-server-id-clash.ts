// The server IDs that equal the first segment of a tool nixie registers: a tool whose name starts
// with `<id>.` or `<id>_`, such as `web` for `web_fetch`. A proxied tool `web.search` and nixie's
// own `web_search` would reach the model under the same name.
export function findServerIDClash(
  serverIDs: readonly string[],
  toolNames: readonly string[],
): { readonly serverID: string; readonly tool: string } | null {
  for (const serverID of serverIDs) {
    const tool = toolNames.find(
      (name) => name.startsWith(`${serverID}.`) || name.startsWith(`${serverID}_`),
    );

    if (tool !== undefined) {
      return { serverID, tool };
    }
  }

  return null;
}
