import { onTestFinished } from 'bun:test';
import type { HostRouterOptions } from '@heynixie/api';
import { makeHostResponder } from '@heynixie/api';
import { startTestAPI } from '@heynixie/api/test-utils';
import { startControlSocket } from '../start-control-socket';

export interface TestControlSocketOptions {
  readonly path: string;

  // the memory store the memory procedures reach, none by default
  readonly readMemory?: HostRouterOptions['readMemory'];
}

// Starts the API on a fresh data directory and the control socket at path, which serves the host
// procedures over the API's context and the memory given. A reset fails, because no server runs
// behind the socket. It stops the socket when the test finishes.
export async function startTestControlSocket(options: TestControlSocketOptions): Promise<void> {
  const api = await startTestAPI();

  const socket = await startControlSocket({
    path: options.path,
    respond: makeHostResponder({
      context: api.context,
      readMemory: options.readMemory ?? (() => null),
      runReset: () => Promise.reject(new Error('no server runs behind the test socket')),
    }),
  });

  onTestFinished(() => socket.stop());
}
