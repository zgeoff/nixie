import { findHeldToolName, findServerOfWildcard } from './find-held-tool-name';

export interface HeldToolNames {
  // nixie's own name of each listed tool that is registered, in the listed order, once each
  readonly held: readonly string[];

  // each listed name that names no registered tool
  readonly unknown: readonly string[];
}

// Maps a tool list to the names it holds. A `<server>.*` entry of a configured server holds each of
// that server's registered tools and no other. The expansion reads the names it is given, so the
// registry's live names give the tools that the server exposes now.
export function collectHeldToolNames(
  listed: readonly string[],
  toolNames: readonly string[],
  serverIDs: readonly string[] = [],
): HeldToolNames {
  const found = listed.map((tool) => ({ tool, names: findEntryNames(tool, toolNames, serverIDs) }));

  return {
    held: [...new Set(found.flatMap((entry) => entry.names ?? []))],
    unknown: found.filter((entry) => entry.names === null).map((entry) => entry.tool),
  };
}

function findEntryNames(
  entry: string,
  toolNames: readonly string[],
  serverIDs: readonly string[],
): readonly string[] | null {
  const serverID = findServerOfWildcard(entry);

  if (serverID !== null && serverIDs.includes(serverID)) {
    return toolNames.filter((name) => name.startsWith(`${serverID}.`));
  }

  const name = findHeldToolName(entry, toolNames);

  return name === null ? null : [name];
}
