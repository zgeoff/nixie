import type { AddressCheck } from '@heynixie/egress';
import { startCheckingProxy } from '@heynixie/egress';
import type { ComputerHandler } from '@heynixie/wire';
import { handleShellRequest } from './handle-shell-request';

export interface ShellHandlerOptions {
  readonly root: string;
  readonly baseEnv: Readonly<Record<string, string>>;
  readonly checkAddress: AddressCheck;
  readonly resolveHost: (host: string) => Promise<readonly string[]>;
  readonly takeIsDiskNew: () => Promise<boolean>;
}

// A command runs with its proxy settings pointing at a checking proxy that lives for that command
// alone, so every connection it opens passes the address checks and the server's secret scan.
export function makeShellHandler(options: ShellHandlerOptions): ComputerHandler {
  return async (request, askScan) => {
    if (request.op !== 'run') {
      return handleShellRequest({ ...options, env: options.baseEnv }, request);
    }

    // the server answers each hop frame in order, so one scan runs at a time
    let queue: Promise<unknown> = Promise.resolve();

    const proxy = await startCheckingProxy({
      checkAddress: options.checkAddress,
      resolveHost: options.resolveHost,
      scanURL: (url) => {
        const scanned = queue.then(() => askScan(url));

        queue = scanned.then(
          () => null,
          () => null,
        );

        return scanned;
      },
    });

    try {
      const env = buildProxyEnv(options.baseEnv, `http://127.0.0.1:${String(proxy.port)}`);

      return await handleShellRequest({ ...options, env }, request);
    } finally {
      await proxy.stop();
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
