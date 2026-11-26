import invariant from 'tiny-invariant';
import type { CLIFlags, CLIIO, Command, HostTransport } from '../types';

export function createMcpCommands(host: HostTransport): readonly (readonly [string, Command])[] {
  return [
    ['mcp allow', (flags, io) => runMcpAllow(host, flags, io)],
    ['mcp notices', (flags, io) => runMcpNotices(host, flags, io)],
  ];
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

const defaultNoticeLimit = 20;

// Prints the newest notices of changes that applied with no allow, one JSON line each, newest first:
// a trusted server's changed tool, and a tool that a listing dropped.
async function runMcpNotices(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(flags.config);

  const read = await host.sendHostRequest(socketPath, 'mcp notices', (client) =>
    client.mcp.notices({ limit: flags.limit ?? defaultNoticeLimit }),
  );

  for (const notice of read.notices) {
    io.print(JSON.stringify(notice));
  }

  return 0;
}
