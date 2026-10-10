import type { ExecExit, ProcessIO } from '@heynixie/sandbox';
import { sendGroupSignal } from './send-group-signal';

export interface ProcessGroupOptions {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly killGraceMs: number;
}

export interface ProcessGroup extends ProcessIO {
  readonly pause: () => void;
  readonly resume: () => void;
}

// Starts a command as the leader of its own process group, the double's stand-in for imp's cgroup.
// A stop sends SIGTERM to the group and SIGKILL killGraceMs later, and exit waits for the group.
// A member that leaves the group with setsid escapes it, which imp's cgroup kill catches.
export function startProcessGroup(options: ProcessGroupOptions): ProcessGroup {
  const child = Bun.spawn([...options.argv], {
    cwd: options.cwd,
    env: { ...options.env },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    detached: true,
  });
  const stop = makeGroupStop(child.pid, options.killGraceMs);

  return {
    stdout: child.stdout,
    stderr: child.stderr,
    write: async (bytes) => {
      await child.stdin.write(bytes);
      await child.stdin.flush();
    },
    closeStdin: async () => {
      await child.stdin.end();
    },
    exit: waitForProcessExit(
      { pid: child.pid, exited: child.exited, readExit: () => toExecExit(child) },
      stop,
    ),
    stop: stop.send,
    pause: () => {
      sendGroupSignal(child.pid, 'SIGSTOP');
    },
    resume: () => {
      sendGroupSignal(child.pid, 'SIGCONT');
    },
  };
}

interface GroupStop {
  readonly send: () => void;

  // resolves once the kill at the deadline ran, or never when no stop was sent
  readonly deadline: () => Promise<void> | null;
}

function makeGroupStop(pid: number, killGraceMs: number): GroupStop {
  const state = { deadline: null as Promise<void> | null };

  return {
    send: () => {
      if (state.deadline !== null) {
        return;
      }
      sendGroupSignal(pid, 'SIGTERM');
      state.deadline = stopGroupAfter(pid, killGraceMs);
    },
    deadline: () => state.deadline,
  };
}

async function stopGroupAfter(pid: number, killGraceMs: number): Promise<void> {
  await Bun.sleep(killGraceMs);
  sendGroupSignal(pid, 'SIGKILL');
}

interface Leader {
  readonly pid: number;
  readonly exited: Promise<number>;
  readonly readExit: () => ExecExit;
}

// the exit of the leader, and after a stop the end of the whole group, as imp's EXIT means
async function waitForProcessExit(leader: Leader, stop: GroupStop): Promise<ExecExit> {
  await leader.exited;

  const deadline = stop.deadline();

  if (deadline !== null) {
    await waitForGroupExit(leader.pid, deadline);
  }
  return leader.readExit();
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a subprocess handle has no readonly form
function toExecExit(child: Bun.Subprocess): ExecExit {
  return { code: child.signalCode === null ? child.exitCode : null, signal: child.signalCode };
}

// After the kill, a member gets this long to go, as imp's guest agent allows; a zombie no one reaps
// would otherwise hold the exit forever.
const reapGraceMs = 5000;

async function waitForGroupExit(pid: number, deadline: Promise<void>): Promise<void> {
  const limit = { isReached: false };
  const waitForReapLimit = async (): Promise<void> => {
    await deadline;
    await Bun.sleep(reapGraceMs);
    limit.isReached = true;
  };

  void waitForReapLimit();
  while (hasGroup(pid) && !limit.isReached) {
    // oxlint-disable-next-line no-await-in-loop -- polls the group until it is gone
    await Bun.sleep(20);
  }
}

function hasGroup(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}
