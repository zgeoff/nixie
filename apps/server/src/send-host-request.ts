import type { HostContractClient } from '@heynixie/contract';
import { ORPCError } from '@orpc/client';
import { buildHostClient } from './build-host-client';

// Sends one host command's request through the running server's control socket, and returns the
// procedure's answer. A refusal throws with the status and the reason the server gave, under the
// request's name, such as "memory approve".
export async function sendHostRequest<T>(
  socketPath: string,
  name: string,
  call: (client: HostContractClient) => Promise<T>,
): Promise<T> {
  try {
    return await call(buildHostClient(socketPath));
  } catch (error) {
    // a transport failure, such as no server on the socket, keeps its own error
    if (!(error instanceof ORPCError)) {
      throw error;
    }

    throw new Error(`nixie answered the ${name} request with ${error.status}: ${error.message}`, {
      cause: error,
    });
  }
}
