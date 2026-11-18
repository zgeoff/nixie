import { onTestFinished } from 'bun:test';
import type { HostRouterOptions } from '@heynixie/api';
import { makeHostResponder } from '@heynixie/api';
import { startTestAPI } from '@heynixie/api/test-utils';
import { startControlSocket } from '../part/start-control-socket';
import { buildAPIGate } from '../utils/build-api-gate';

export interface TestControlSocketOptions {
  readonly path: string;

  // gives the API a spending stop on a stub gateway
  readonly isSpendOn?: boolean;

  readonly readMemory?: HostRouterOptions['readMemory'];
  readonly readBackups?: HostRouterOptions['readBackups'];
  readonly runReset?: HostRouterOptions['runReset'];
}

type TestAPI = Awaited<ReturnType<typeof startTestAPI>>;

export async function startTestControlSocket(options: TestControlSocketOptions): Promise<TestAPI> {
  const api = await startTestAPI(undefined, { isSpendOn: options.isSpendOn === true });

  const socket = await startControlSocket({
    path: options.path,
    respond: makeHostResponder({
      context: api.context,
      readMemory: options.readMemory ?? (() => null),
      readBackups: options.readBackups ?? (() => null),

      runInForceSeed: () => Promise.resolve(),
      readDefinitions: () => null,
      readInForce: () => null,
      wakeExports: () => {},
      runReset:
        options.runReset ??
        (() => Promise.reject(new Error('no server runs behind the test socket'))),
      runConversationReset: () =>
        Promise.reject(new Error('no server runs behind the test socket')),
      gate: buildAPIGate(),
    }),
  });

  onTestFinished(() => socket.stop());

  return api;
}
