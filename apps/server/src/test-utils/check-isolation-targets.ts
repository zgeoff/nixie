import { isIPv6 } from 'node:net';
import type { NetworkInterfaceInfo } from 'node:os';
import { networkInterfaces } from 'node:os';
import { hasRoutableIPv6 } from './has-routable-ipv6';

type IsolationTarget = readonly [host: string, port: number];

// A sandbox's failed connection proves isolation only when its target has a live listener, so this
// machine, the trusted vantage point, connects to each target too, and prints each IPv6 target it
// cannot reach for want of routable IPv6. Each line is `<target> listener <x>; sandbox <y>`.
export async function checkIsolationTargets(
  targets: readonly IsolationTarget[],
  probeFromSandbox: (host: string, port: number) => Promise<string>,
  interfaces: Readonly<
    Record<string, readonly Readonly<NetworkInterfaceInfo>[] | undefined>
  > = networkInterfaces(),
): Promise<string[]> {
  const hasIPv6 = hasRoutableIPv6(interfaces);

  const lines = await Promise.all(
    targets.map(async ([host, port]) => {
      const [listener, sandbox] = await Promise.all([
        checkListener(host, port, hasIPv6),
        probeFromSandbox(host, port),
      ]);

      return `${host}:${port} listener ${listener}; sandbox ${sandbox}`;
    }),
  );

  for (const line of lines.filter((entry) => entry.includes(' listener unprovable '))) {
    console.warn(`no listener proof: ${line}`);
  }

  return lines;
}

async function checkListener(host: string, port: number, hasIPv6: boolean): Promise<string> {
  if (isIPv6(host) && !hasIPv6) {
    return 'unprovable from the runner, which has no routable IPv6 address';
  }

  const timeout = Promise.withResolvers<string>();

  const timer = setTimeout(() => {
    timeout.resolve('failed timeout');
  }, 5000);

  try {
    return await Promise.race([tryConnect(host, port), timeout.promise]);
  } finally {
    clearTimeout(timer);
  }
}

async function tryConnect(host: string, port: number): Promise<string> {
  try {
    const socket = await Bun.connect({ hostname: host, port, socket: { data() {} } });

    socket.end();

    return 'connected';
  } catch (error) {
    return `failed ${getErrorCode(error)}`;
  }
}

function getErrorCode(error: unknown): string {
  if (error instanceof Error) {
    return 'code' in error && typeof error.code === 'string' ? error.code : error.message;
  }

  return String(error);
}
