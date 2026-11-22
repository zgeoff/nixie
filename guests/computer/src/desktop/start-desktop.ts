import { readFile } from 'node:fs/promises';
import invariant from 'tiny-invariant';
import type { DesktopProcess } from './build-desktop-processes';
import { display } from './constants';

export interface Desktop {
  readonly stop: () => void;
}

interface Supervision {
  readonly running: Set<Bun.Subprocess>;
  isStopped: boolean;
}

// Starts the display, waits until it listens, then starts the rest. A supervised process starts again
// after it exits, such as a terminal the user closed. The display's own exit is the guest's, because
// every window goes with it.
export async function startDesktop(
  processes: readonly DesktopProcess[],
  onDisplayExit: () => void,
): Promise<Desktop> {
  const [displayProcess, ...rest] = processes;

  invariant(displayProcess !== undefined, 'the desktop starts a display first');

  const supervision: Supervision = { running: new Set(), isStopped: false };
  const displayChild = spawnProcess(displayProcess);

  supervision.running.add(displayChild);
  void watchDisplay(displayChild, supervision, onDisplayExit);

  await waitForDisplay();

  for (const process of rest) {
    void superviseProcess(process, supervision);
  }

  return {
    stop: () => {
      supervision.isStopped = true;

      for (const child of supervision.running) {
        child.kill('SIGTERM');
      }
    },
  };
}

function spawnProcess(process: DesktopProcess): Bun.Subprocess {
  return Bun.spawn([...process.argv], {
    env: process.env,
    ...(process.cwd === undefined ? {} : { cwd: process.cwd }),
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'inherit',
  });
}

async function watchDisplay(
  child: Bun.Subprocess,
  supervision: Supervision,
  onDisplayExit: () => void,
): Promise<void> {
  await child.exited;

  if (!supervision.isStopped) {
    onDisplayExit();
  }
}

const displayWaitMs = 10_000;

// The display is an abstract socket, which the kernel lists in /proc/net/unix with a leading @.
async function waitForDisplay(): Promise<void> {
  const socket = `@/tmp/.X11-unix/X${display.slice(1)}`;
  const deadlineMs = Date.now() + displayWaitMs;

  while (Date.now() < deadlineMs) {
    const sockets = await readFile('/proc/net/unix', 'utf8');

    if (sockets.split('\n').some((line) => line.endsWith(socket))) {
      return;
    }

    await Bun.sleep(50);
  }

  throw new Error(`the display ${display} did not start listening`);
}

const restartDelayMs = 1000;

async function superviseProcess(process: DesktopProcess, supervision: Supervision): Promise<void> {
  while (!supervision.isStopped) {
    const child = spawnProcess(process);

    supervision.running.add(child);

    await child.exited;

    supervision.running.delete(child);

    if (!process.isSupervised) {
      return;
    }

    await Bun.sleep(restartDelayMs);
  }
}
