import type { HostContractClient } from '@heynixie/contract';
import { ORPCError } from '@orpc/client';
import { buildHostClient } from './build-host-client';

export async function sendHostRequest<T>(
  socketPath: string,
  name: string,
  call: (client: HostContractClient) => Promise<T>,
): Promise<T> {
  try {
    return await call(buildHostClient(socketPath));
  } catch (error) {
    if (!(error instanceof ORPCError)) {
      throw error;
    }

    throw new Error(`nixie answered the ${name} request with ${error.status}: ${error.message}`, {
      cause: error,
    });
  }
}
