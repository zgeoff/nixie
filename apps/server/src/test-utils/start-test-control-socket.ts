import { onTestFinished } from 'bun:test';
import type { HostRouterOptions } from '@heynixie/api';
import { makeHostResponder } from '@heynixie/api';
import { startTestAPI } from '@heynixie/api/test-utils';
import { buildAPIGate } from '../build-api-gate';
import { startControlSocket } from '../start-control-socket';

export interface TestControlSocketOptions {
  readonly path: string;

  readonly readMemory?: HostRouterOptions['readMemory'];
  readonly runReset?: HostRouterOptions['runReset'];
}

type TestAPI = Awaited<ReturnType<typeof startTestAPI>>;

export async function startTestControlSocket(options: TestControlSocketOptions): Promise<TestAPI> {
  const api = await startTestAPI();

  const socket = await startControlSocket({
    path: options.path,
    respond: makeHostResponder({
      context: api.context,
      readMemory: options.readMemory ?? (() => null),

      seedWrittenSkills: () => Promise.resolve(),
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
