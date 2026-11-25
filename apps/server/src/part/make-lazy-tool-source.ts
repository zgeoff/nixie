import type { ToolSource } from '@heynixie/tools';

// A tool source that reaches its tools only once they exist: the registry is built before the
// source starts, so each read asks again, and a source that has not started has no tools.
export function makeLazyToolSource(pickSource: () => ToolSource | null): ToolSource {
  return {
    toolNames: () => pickSource()?.toolNames() ?? [],
    findTool: (name) => pickSource()?.findTool(name) ?? null,
  };
}
