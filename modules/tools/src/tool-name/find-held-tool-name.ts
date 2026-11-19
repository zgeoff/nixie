import { toSDKToolName } from './to-sdk-tool-name';

// The model sees each tool by its SDK name, so a tool list may name a tool either way.
export function findHeldToolName(name: string, toolNames: readonly string[]): string | null {
  if (toolNames.includes(name)) {
    return name;
  }

  return toolNames.find((tool) => toSDKToolName(tool) === name) ?? null;
}
