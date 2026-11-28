// The one live connection a tool is pinned to, or null when the pins leave a choice.
export function findSoleConnection(
  pinned: readonly string[] | undefined,
  live: ReadonlySet<string> | null,
): string | null {
  if (pinned === undefined || live === null) {
    return null;
  }

  const reachable = pinned.filter((connection) => live.has(connection));

  return reachable.length === 1 ? (reachable[0] ?? null) : null;
}
