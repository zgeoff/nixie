import { createStandInMcpHandler } from './start-stand-in-mcp-site';
import type { StandInMcpControls, StandInMcpSiteOptions } from './start-stand-in-mcp-site';

export interface StandInMcpLoopback extends StandInMcpControls {
  readonly origin: string;
  readonly mcpURL: string;
  readonly stop: () => Promise<void>;
}

// The stand-in MCP server as plain http on a loopback port, for a test build that runs outside
// bun:test. The test build's config accepts http for a loopback host, and the caller stops it.
export function startStandInMcpLoopback(options: StandInMcpSiteOptions = {}): StandInMcpLoopback {
  const handler = createStandInMcpHandler(options);
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: handler.respond });
  const origin = `http://127.0.0.1:${String(server.port)}`;

  handler.setOrigin(origin);

  return {
    ...handler.controls,
    origin,
    mcpURL: `${origin}/mcp`,
    stop: () => server.stop(true),
  };
}
