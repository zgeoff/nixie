import invariant from 'tiny-invariant';
import type { CLIFlags, CLIIO, Command, HostTransport } from '../types';

export function createMcpCommands(host: HostTransport): readonly (readonly [string, Command])[] {
  return [['mcp allow', (flags, io) => runMcpAllow(host, flags, io)]];
}

// Writes the allow proposal of a tool that waits for one. A listing never proposes the same form
// twice, so this is the way back after you declined a proposal or it lapsed.
async function runMcpAllow(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const tool = flags.tool;

  invariant(tool !== undefined, 'the CLI parser requires a tool name');

  const socketPath = await host.resolveSocketPath(flags.config);

  const proposed = await host.sendHostRequest(socketPath, 'mcp allow', (client) =>
    client.mcp.allow({ tool }),
  );

  io.print(JSON.stringify(proposed));

  return proposed.status === 'proposed' ? 0 : 1;
}
