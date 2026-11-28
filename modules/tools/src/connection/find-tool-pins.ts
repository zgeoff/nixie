import { toSDKToolName } from '../tool-name/to-sdk-tool-name';

// The connections a run pins one tool to, or undefined when the pins leave the tool out. A run lists
// a tool by its registered name or by the name the model sees, and both find the same pins.
export function findToolPins(
  pins: Readonly<Record<string, readonly string[]>> | undefined,
  tool: string,
): readonly string[] | undefined {
  if (pins === undefined) {
    return undefined;
  }

  const wanted = toKey(tool);

  return Object.entries(pins).find(([name]) => toKey(name) === wanted)?.[1];
}

const sdkPrefix = 'mcp__nixie__';

function toKey(name: string): string {
  return name.startsWith(sdkPrefix) ? name : toSDKToolName(name);
}
