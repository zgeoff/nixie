import { formatIPv4OnlyReason } from '@heynixie/egress';
import type { ComputerReply } from '@heynixie/wire';

// The reply a load of an address answers. A load that failed on a tunnel the proxy refused, after
// the proxy named a host with no IPv4 address, says so in place of the browser's tunnel error.
export function pickIPv4OnlyReply(reply: ComputerReply, hosts: readonly string[]): ComputerReply {
  const host = hosts.at(-1);

  if (
    reply.kind !== 'failed' ||
    host === undefined ||
    reply.message === undefined ||
    !reply.message.includes('net::ERR_TUNNEL_CONNECTION_FAILED')
  ) {
    return reply;
  }

  return { kind: 'failed', ok: false, reason: 'failed', message: formatIPv4OnlyReason(host) };
}
