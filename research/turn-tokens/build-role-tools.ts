// The tool definitions each role's model sees, built by the production builders with stand-in
// stores. The model reads only each tool's name, description and input schema, and the spike's
// tool server answers every call from a script, so no store is ever reached.
// @boundaries-ignore a spike imports the code it measures
import { buildTimeTool } from '../../modules/connectors/src/time/build-time-tool';
// @boundaries-ignore a spike imports the code it measures
import { buildWebFetchTool } from '../../modules/connectors/src/web/build-web-fetch-tool';
// @boundaries-ignore a spike imports the code it measures
import { buildLogReadTool } from '../../modules/memory/src/log/build-log-read-tool';
// @boundaries-ignore a spike imports the code it measures
import { buildMemoryTools } from '../../modules/memory/src/memory/build-memory-tools';
import type { ListedTool } from './start-tool-server';

export type ToolSet = 'conversation' | 'worker';

const unused = {} as never;
const options = {
  clock: { now: () => Date.now() },
  ownerName: 'Sam',
  agentName: 'nixie',
  defaultZone: 'Europe/Lisbon',
};

export function buildRoleTools(set: ToolSet): readonly ListedTool[] {
  const webFetch = buildWebFetchTool(() => Promise.reject(new Error('unused')), unused);
  const definitions = {
    conversation: () => [
      webFetch,
      buildTimeTool({ ...options, findTimeZone: () => Promise.resolve(null) }),
      buildLogReadTool(unused),
      ...buildMemoryTools(unused, options),
    ],
    worker: () => [webFetch],
  }[set]();

  return definitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input: tool.input as Record<string, unknown>,
  }));
}
