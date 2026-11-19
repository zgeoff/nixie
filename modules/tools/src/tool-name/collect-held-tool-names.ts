import { findHeldToolName } from './find-held-tool-name';

export interface HeldToolNames {
  // nixie's own name of each listed tool that is registered, in the listed order, once each
  readonly held: readonly string[];

  // each listed name that names no registered tool
  readonly unknown: readonly string[];
}

export function collectHeldToolNames(
  listed: readonly string[],
  toolNames: readonly string[],
): HeldToolNames {
  const found = listed.map((tool) => ({ tool, name: findHeldToolName(tool, toolNames) }));

  return {
    held: [...new Set(found.flatMap((entry) => (entry.name === null ? [] : [entry.name])))],
    unknown: found.filter((entry) => entry.name === null).map((entry) => entry.tool),
  };
}
