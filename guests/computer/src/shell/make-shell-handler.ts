import type { ComputerHandler } from '@heynixie/wire';
import { handleShellRequest } from './handle-shell-request';
import type { TerminalAccount } from './terminal-account';

export interface ShellHandlerOptions {
  readonly root: string;
  readonly baseEnv: Readonly<Record<string, string>>;
  readonly account: TerminalAccount;

  // the Unix socket of the guest's checking proxy, the one way out of a command's network namespace
  readonly proxySocketPath: string;
  readonly takeIsDiskNew: () => Promise<boolean>;

  // the program that runs a command inside its network namespace, as `bridge-main.ts` holds it
  readonly bridgeScript: string;
}

// What a command reads from the bridge's standard input: nothing, as for `computer.run`, or the
// terminal that the terminal app gives its shell.
export type BridgeStdin = 'closed' | 'inherit';

// the loopback port of the bridge, which only the command's own namespace holds
export const bridgePort = 3128;

// A command runs in a network namespace that holds a loopback and nothing else, so a raw socket or
// `--noproxy` finds no route out. A bridge in that namespace passes each connection to the guest's
// checking proxy, which scans through the guest's scan channel.
export function makeShellHandler(options: ShellHandlerOptions): ComputerHandler {
  return (request) => {
    if (request.op !== 'run') {
      return handleShellRequest({ ...options, env: options.baseEnv }, request);
    }

    return handleShellRequest(
      { ...options, env: buildProxyEnv(options.baseEnv, `http://127.0.0.1:${String(bridgePort)}`) },
      {
        ...request,
        argv: buildNamespacedArgv(options, request.argv),
      },
    );
  };
}

export function buildProxyEnv(
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

// The command, as the terminal's account, in new user, network, process and mount namespaces, with
// a /proc of its own. The display's socket sits in the guest's own network namespace, so no command
// reaches it. unshare kills the namespace when it is killed, so a timed-out command leaves nothing.
export function buildNamespacedArgv(
  options: Pick<ShellHandlerOptions, 'account' | 'bridgeScript' | 'proxySocketPath'>,
  argv: readonly string[],
): string[] {
  return options.account.wrap(buildUnshareArgv(options, argv, 'closed'));
}

// The same command for a process that already runs as the terminal's user, such as the shell that
// the terminal app starts.
export function buildUnshareArgv(
  options: Pick<ShellHandlerOptions, 'bridgeScript' | 'proxySocketPath'>,
  argv: readonly string[],
  stdin: BridgeStdin,
): string[] {
  return [
    'unshare',
    '--user',
    '--map-root-user',
    '--net',
    '--pid',
    '--mount',
    '--mount-proc',
    '--fork',
    '--kill-child',
    process.execPath,
    options.bridgeScript,
    options.proxySocketPath,
    String(bridgePort),
    stdin,
    ...argv,
  ];
}
