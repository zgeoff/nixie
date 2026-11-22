import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressCheck } from '@heynixie/egress';
import { startSocketProxy } from '@heynixie/egress';
import type { ComputerHandler } from '@heynixie/wire';
import { handleShellRequest } from './handle-shell-request';

export interface ShellHandlerOptions {
  readonly root: string;
  readonly baseEnv: Readonly<Record<string, string>>;
  readonly checkAddress: AddressCheck;
  readonly resolveHost: (host: string) => Promise<readonly string[]>;
  readonly takeIsDiskNew: () => Promise<boolean>;

  // the program that runs a command inside its network namespace, as `bridge-main.ts` holds it
  readonly bridgeScript: string;
}

// the loopback port of the bridge, which only the command's own namespace holds
const bridgePort = 3128;

// A command runs in a network namespace that holds a loopback and nothing else, so a raw socket or
// `--noproxy` finds no route out. A bridge in that namespace passes each connection to a checking
// proxy that lives for that command alone.
export function makeShellHandler(options: ShellHandlerOptions): ComputerHandler {
  return async (request, askScan, askScanText) => {
    if (request.op !== 'run') {
      return handleShellRequest({ ...options, env: options.baseEnv }, request);
    }

    // the server answers each hop frame in order, so one scan runs at a time
    let queue: Promise<void> = Promise.resolve();

    const inTurn = async (ask: () => Promise<void>): Promise<void> => {
      const previous = queue;
      const done = Promise.withResolvers<void>();

      queue = done.promise;

      await previous;

      try {
        await ask();
      } finally {
        done.resolve();
      }
    };

    const folder = await mkdtemp(join(tmpdir(), 'nixie-proxy-'));

    const socketPath = join(folder, 'proxy.sock');

    const proxy = await startSocketProxy(
      {
        checkAddress: options.checkAddress,
        resolveHost: options.resolveHost,
        scanURL: (url) => inTurn(() => askScan(url)),
        scanText: (text) => inTurn(() => askScanText(text)),
        canTunnel: false,
      },
      socketPath,
    );

    try {
      const env = buildProxyEnv(options.baseEnv, `http://127.0.0.1:${String(bridgePort)}`);

      return await handleShellRequest(
        { ...options, env },
        {
          ...request,
          argv: buildNamespacedArgv(options.bridgeScript, socketPath, request.argv),
        },
      );
    } finally {
      await proxy.stop();

      await rm(folder, { recursive: true, force: true });
    }
  };
}

function buildProxyEnv(
  baseEnv: Readonly<Record<string, string>>,
  proxyURL: string,
): Record<string, string> {
  const kept = Object.entries(baseEnv).filter(([name]) => !name.toLowerCase().includes('proxy'));

  return {
    ...Object.fromEntries(kept),
    HTTP_PROXY: proxyURL,
    HTTPS_PROXY: proxyURL,
    ALL_PROXY: proxyURL,
    http_proxy: proxyURL,
    https_proxy: proxyURL,
    all_proxy: proxyURL,
  };
}

// unshare kills the whole namespace when it is killed, so a command that outlives its time limit
// leaves nothing behind
function buildNamespacedArgv(
  bridgeScript: string,
  socketPath: string,
  argv: readonly string[],
): string[] {
  return [
    'unshare',
    '--user',
    '--map-root-user',
    '--net',
    '--pid',
    '--fork',
    '--kill-child',
    process.execPath,
    bridgeScript,
    socketPath,
    String(bridgePort),
    ...argv,
  ];
}
