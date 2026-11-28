import { buildToolRegistry } from '../build-tool-registry';
import type { ToolSource } from '../types';
import { buildMockToolDefinition } from './build-mock-tool-definition';

export interface ServerToolSource {
  readonly source: ToolSource;

  // Sets the names that the source serves now, as a proxy does once its servers list.
  readonly expose: (names: readonly string[]) => void;
}

// A source of the servers boxxy and boxxy2 that serves no tool until a test exposes its name. Each
// name it can serve is one of `registered`.
export function buildServerToolSource(registered: readonly string[]): ServerToolSource {
  const state: { exposed: readonly string[] } = { exposed: [] };
  const served = buildToolRegistry(registered.map((name) => buildMockToolDefinition({ name })));

  return {
    source: {
      toolNames: () => state.exposed,
      serverIDs: () => ['boxxy', 'boxxy2'],
      findTool: (name) => (state.exposed.includes(name) ? served.findTool(name) : null),
    },
    expose: (names) => {
      state.exposed = names;
    },
  };
}
