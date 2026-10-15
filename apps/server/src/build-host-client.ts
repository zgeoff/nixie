import type { HostContractClient } from '@heynixie/contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

// A client of the host procedures the running server serves on its control socket. Bun.fetch,
// because only Bun's own fetch takes a Unix socket.
export function buildHostClient(socketPath: string): HostContractClient {
  return createORPCClient<HostContractClient>(
    new RPCLink({
      url: 'http://localhost/rpc',
      fetch: (request, init) => Bun.fetch(request, { ...init, unix: socketPath }),
    }),
  );
}
