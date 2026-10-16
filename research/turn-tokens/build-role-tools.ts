// The tool definitions each role's model sees, built by the production builders with stand-in
// stores. The model reads only each tool's name, description and input schema, and the spike's
// tool server answers every call from a script, so no store is ever reached.
import { buildTimeTool } from '../../modules/connectors/src/build-time-tool';
import { buildWebFetchTool } from '../../modules/connectors/src/build-web-fetch-tool';
import { buildConsolidatorTools } from '../../modules/memory/src/build-consolidator-tools';
import { buildLogReadTool } from '../../modules/memory/src/build-log-read-tool';
import { buildMemoryTools } from '../../modules/memory/src/build-memory-tools';
import { buildWriterTools } from '../../modules/memory/src/build-writer-tools';
import type { ListedTool } from './start-tool-server';

export type ToolSet = 'conversation' | 'memory-writer' | 'memory-consolidator' | 'worker';

const unused = {} as never;
const options = {
  clock: { now: () => Date.now() },
  ownerName: 'Sam',
  agentName: 'nixie',
  defaultZone: 'Europe/Lisbon',
};

export function buildRoleTools(set: ToolSet): readonly ListedTool[] {
  const webFetch = buildWebFetchTool(() => Promise.reject(new Error('unused')));
  const definitions = {
    conversation: () => [
      webFetch,
      buildTimeTool({ ...options, findTimeZone: () => Promise.resolve(null) }),
      buildLogReadTool(unused),
      ...buildMemoryTools(unused, options),
    ],
    'memory-writer': () => buildWriterTools(unused, unused, 20),
    'memory-consolidator': () => buildConsolidatorTools(unused, unused, 20),
    worker: () => [webFetch],
  }[set]();

  return definitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input: tool.input as Record<string, unknown>,
  }));
}
