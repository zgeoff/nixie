import { once } from 'node:events';
import type { Socket } from 'node:net';
import { createConnection, isIPv6 } from 'node:net';
import type { NetworkInterfaceInfo } from 'node:os';
import { networkInterfaces } from 'node:os';
import { hasRoutableIPv6 } from './has-routable-ipv6';

interface IsolationTarget {
  host: string;
  port: number;
  listener: 'required' | 'optional';
}

interface ListenerCheckOptions {
  interfaces: Readonly<Record<string, readonly Readonly<NetworkInterfaceInfo>[] | undefined>>;
  deadlineMs: number;
  openSocket: (host: string, port: number) => Socket;
}

export async function checkIsolationTargets(
  targets: readonly Readonly<IsolationTarget>[],
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
    targets.map(async (target) => {
      const [listener, sandbox] = await Promise.all([
        checkListener(target, hasIPv6, options),
        probeFromSandbox(target.host, target.port),
      ]);

      return `${target.host}:${target.port} listener ${listener}; sandbox ${sandbox}`;
    }),
  );

  for (const line of lines.filter((entry) => entry.includes(' listener unprovable '))) {
    console.warn(`no listener proof: ${line}`);
  }

  return lines;
}

// only a refusal shows that nothing listens, so a timeout fails an optional target too
async function checkListener(
  target: Readonly<IsolationTarget>,
  hasIPv6: boolean,
  options: Readonly<ListenerCheckOptions>,
): Promise<string> {
  if (isIPv6(target.host) && !hasIPv6) {
    return 'unprovable from the runner, which has no routable IPv6 address';
  }

  const failure = await tryCheckConnection(target, options);

  if (failure === null) {
    return 'connected';
  }

  if (target.listener === 'optional' && failure === 'ECONNREFUSED') {
    return 'unprovable from the runner, which finds no listener on the port';
  }

  return `failed ${failure}`;
}

async function tryCheckConnection(
  target: Readonly<IsolationTarget>,
  options: Readonly<ListenerCheckOptions>,
): Promise<string | null> {
  const socket = options.openSocket(target.host, target.port);

  try {
    await once(socket, 'connect', { signal: AbortSignal.timeout(options.deadlineMs) });

    return null;
  } catch (error) {
    return getFailureReason(error);
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
