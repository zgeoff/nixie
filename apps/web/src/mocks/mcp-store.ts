import type { ContractOutputs } from '@heynixie/contract';

export type MockMcpServer = ContractOutputs['mcp']['listServers'][number];

const servers: MockMcpServer[] = [];
const connects: { server: string; origin: string }[] = [];

// The MCP servers that the mock proxy holds, and the sign-ins that a page started. A test puts a
// server in with `add`, and the mock's connect answers any server that is in.
export const mcpStore = {
  servers,
  connects,
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
  },
};
