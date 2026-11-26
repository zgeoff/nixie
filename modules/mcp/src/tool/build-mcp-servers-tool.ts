import type { ToolDefinition } from '@heynixie/tools';
import type { Mcp } from '../start-mcp';

// `mcp.servers`: lists every server that is not removed, with its state, whether its sign-in holds,
// its health and the count of its tools that are exposed, stopped and hidden. The model reads it to
// say why a proxied tool cannot run. Without a started proxy it answers an error.
export function buildMcpServersTool(readMcp: () => Mcp | null): ToolDefinition {
  return {
    name: 'mcp.servers',
    description:
      'List the outside MCP servers: each one with its state, whether its sign-in holds, whether it is healthy and how many of its tools are exposed, stopped or hidden.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      type: 'object',
      properties: {
        servers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              server: { type: 'string' },
              state: { enum: ['held', 'added'] },
              signIn: { enum: ['ok', 'needs_sign_in', 'not_added'] },
              health: { enum: ['healthy', 'unhealthy'] },
              tools: {
                type: 'object',
                properties: {
                  exposed: { type: 'integer' },
                  stopped: { type: 'integer' },
                  hidden: { type: 'integer' },
                },
                required: ['exposed', 'stopped', 'hidden'],
              },
            },
            required: ['server', 'state', 'signIn', 'health', 'tools'],
          },
        },
      },
      required: ['servers'],
    },
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { servers: 'owner_data' },
    },
    execution: 'direct',
    run: async () => {
      const mcp = readMcp();

      if (mcp === null) {
        return { status: 'error', message: 'the MCP proxy has not started yet' };
      }

      const summaries = await mcp.readSummaries();

      return {
        status: 'ok',
        result: {
          servers: summaries.map((summary) => ({
            server: summary.server,
            state: summary.state,
            signIn: summary.signIn,
            health: summary.health,
            tools: {
              exposed: summary.tools.exposed,
              stopped: summary.tools.stopped,
              hidden: summary.tools.hidden,
            },
          })),
        },
      };
    },
  };
}
