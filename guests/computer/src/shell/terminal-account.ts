// The account that the terminal's processes run as, inside the memory limit they share.
export interface TerminalAccount {
  // Wraps a command so that it runs as the terminal's user and counts against the terminal's
  // memory limit. The wrapped command runs as the same process, with the same standard streams.
  readonly wrap: (argv: readonly string[]) => string[];
}

// The test build's account: the guest's own user, with no limit of its own.
export const ownAccount: TerminalAccount = { wrap: (argv) => [...argv] };

export interface SeparateAccountOptions {
  readonly uid: number;
  readonly gid: number;

  // the `cgroup.procs` file of the cgroup that holds the terminal's memory limit
  readonly cgroupProcsPath: string;
}

// The account of an image: the guest runs as root and starts each terminal process in the terminal's
// cgroup before it drops to the terminal's user. A child inherits both.
export function makeSeparateAccount(options: SeparateAccountOptions): TerminalAccount {
  return {
    wrap: (argv) => [
      'sh',
      '-c',
      'echo $$ > "$1" && shift && exec "$@"',
      'sh',
      options.cgroupProcsPath,
      'setpriv',
      `--reuid=${String(options.uid)}`,
      `--regid=${String(options.gid)}`,
      '--clear-groups',
      '--',
      ...argv,
    ],
  };
}
