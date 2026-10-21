import { sendGroupSignal } from './send-group-signal';
import type { ProcessIO } from './start-exec-stream';
import type { ExecExit } from './types';

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

// A process group stands in for imp's cgroup. A member that calls setsid escapes the group's kill,
// which imp's cgroup kill catches.
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

  readonly deadline: () => Promise<void> | null;
}

function makeGroupStop(pid: number, killGraceMs: number): GroupStop {
  let deadline: Promise<void> | null = null;

  return {
    send: () => {
      if (deadline !== null) {
        return;
      }

      sendGroupSignal(pid, 'SIGTERM');

      deadline = stopGroupAfter(pid, killGraceMs);
    },
    deadline: () => deadline,
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

async function waitForProcessExit(leader: Leader, stop: GroupStop): Promise<ExecExit> {
  await leader.exited;

  const deadline = stop.deadline();

  if (deadline !== null) {
    await waitForGroupExit(leader.pid, deadline);
  }

  return leader.readExit();
}

// imp's guest agent allows a member this long to go after the kill. Without the limit, a zombie that
// no process reaps would hold the exit forever.
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

function toExecExit(child: Bun.Subprocess): ExecExit {
  // Bun gives a signal with no name, such as a real-time one, as its number.
  const signal = child.signalCode === null ? null : String(child.signalCode);

  return { code: child.signalCode === null ? child.exitCode : null, signal };
}
