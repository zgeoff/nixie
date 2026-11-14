import type { HostContractClient } from '@heynixie/contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

export function buildHostClient(socketPath: string): HostContractClient {
  // Only Bun's own fetch takes a Unix socket.
  const sendOverSocket = (request: Request, init: RequestInit) =>
    Bun.fetch(request, { ...init, unix: socketPath });

  return createORPCClient<HostContractClient>(
    new RPCLink({
      url: 'http://localhost/rpc',
      fetch: sendOverSocket,
    }),
  );
}
