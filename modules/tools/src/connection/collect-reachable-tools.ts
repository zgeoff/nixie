import { findToolPins } from './find-tool-pins';

// The tools a run lists, less each tool whose pins all name connections that are forgotten. A tool
// the pins leave out reaches every live connection, so it stays.
export function collectReachableTools(
  tools: readonly string[],
  pins: Readonly<Record<string, readonly string[]>> | undefined,
  live: ReadonlySet<string> | null,
): string[] {
  if (pins === undefined || live === null) {
    return [...tools];
  }

  return tools.filter((tool) => {
    const pinned = findToolPins(pins, tool);

    return pinned === undefined || pinned.some((connection) => live.has(connection));
  });
}
