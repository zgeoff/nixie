import type { ContractOutputs } from '@heynixie/contract';

export type MockMcpServer = ContractOutputs['mcp']['listServers'][number];

const servers: MockMcpServer[] = [];
const connects: { server: string; origin: string }[] = [];
const finishes: string[] = [];

const discoveryFailures = new Map<string, string>();

// The MCP servers that the mock proxy holds, and the sign-ins that a page started, and the state of each return that finished one. A test puts a
// server in with `add`, and the mock's connect answers any server that is in, unless `discoveryFailures` holds a reason for it.
export const mcpStore = {
  servers,
  connects,
  finishes,
  discoveryFailures,
  add: (server: Partial<MockMcpServer> & Pick<MockMcpServer, 'server'>): MockMcpServer => {
    const added: MockMcpServer = {
      state: 'added',
      signIn: 'ok',
      health: 'healthy',
      lastError: null,
      nextTryAtMs: null,
      url: `https://${server.server}.example.test/mcp`,
      proposalID: null,
      tools: [],
      ...server,
    };

    servers.push(added);

    return added;
  },
  reset: (): void => {
    servers.length = 0;
    connects.length = 0;
    finishes.length = 0;

    discoveryFailures.clear();
  },
};
