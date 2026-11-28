import { toSDKToolName } from './to-sdk-tool-name';

// The model sees each tool by its SDK name, so a tool list may name a tool either way. A list that
// holds `<server>.*` holds every tool of that server by its own name.
export function findHeldToolName(name: string, toolNames: readonly string[]): string | null {
  if (toolNames.includes(name)) {
    return name;
  }

  const sdkName = toolNames.find((tool) => toSDKToolName(tool) === name);

  if (sdkName !== undefined) {
    return sdkName;
  }

  return isCoveredByServerEntry(name, toolNames) ? name : null;
}

// The server a `<server>.*` entry names, or null for any other name.
export function findServerOfWildcard(entry: string): string | null {
  return entry.endsWith('.*') && entry.length > 2 ? entry.slice(0, -2) : null;
}

function isCoveredByServerEntry(name: string, toolNames: readonly string[]): boolean {
  const dot = name.indexOf('.');

  return dot > 0 && !name.endsWith('.*') && toolNames.includes(`${name.slice(0, dot)}.*`);
}
