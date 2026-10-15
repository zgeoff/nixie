import { once } from 'node:events';
import type { Socket } from 'node:net';
import { createConnection, isIPv6 } from 'node:net';
import type { NetworkInterfaceInfo } from 'node:os';
import { networkInterfaces } from 'node:os';
import { hasRoutableIPv6 } from './has-routable-ipv6';

type IsolationTarget = readonly [host: string, port: number];

interface ListenerCheckOptions {
  interfaces: Readonly<Record<string, readonly Readonly<NetworkInterfaceInfo>[] | undefined>>;
  deadlineMs: number;
  openSocket: (host: string, port: number) => Socket;
}

// A sandbox's failed connection proves isolation only when its target has a live listener, so this
// machine, the trusted vantage point, connects to each target too, and prints each IPv6 target it
// cannot reach for want of routable IPv6. Each line is `<target> listener <x>; sandbox <y>`.
export async function checkIsolationTargets(
  targets: readonly IsolationTarget[],
  probeFromSandbox: (host: string, port: number) => Promise<string>,
  overrides: Readonly<Partial<ListenerCheckOptions>> = {},
): Promise<string[]> {
  const options: ListenerCheckOptions = {
    interfaces: networkInterfaces(),
    deadlineMs: 5000,
    openSocket: (host, port) => createConnection({ host, port }),
    ...overrides,
  };

  const hasIPv6 = hasRoutableIPv6(options.interfaces);

  const lines = await Promise.all(
    targets.map(async ([host, port]) => {
      const [listener, sandbox] = await Promise.all([
        checkListener([host, port], hasIPv6, options),
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

// the socket closes on every outcome, so a target that drops packets leaves no connection retrying
// after its deadline
async function checkListener(
  [host, port]: IsolationTarget,
  hasIPv6: boolean,
  options: Readonly<ListenerCheckOptions>,
): Promise<string> {
  if (isIPv6(host) && !hasIPv6) {
    return 'unprovable from the runner, which has no routable IPv6 address';
  }

  const socket = options.openSocket(host, port);

  try {
    await once(socket, 'connect', { signal: AbortSignal.timeout(options.deadlineMs) });

    return 'connected';
  } catch (error) {
    return `failed ${getFailureReason(error)}`;
  } finally {
    socket.destroy();
  }
}

function getFailureReason(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return 'timeout';
    }

    return 'code' in error && typeof error.code === 'string' ? error.code : error.message;
  }

  return String(error);
}
