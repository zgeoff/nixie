import { waitForSettled } from '@heynixie/async';
import type { ImpExec } from '../types';

// An exec handle that exists before its exec starts once wait resolves, as imp's client returns one
// before impd sends its started message. A rejected start rejects started and exit, and errors both output streams.
export function buildPendingExec(wait: Promise<void>, start: () => ImpExec): ImpExec {
  const starting = startAfter(wait, start);

  const stdout = new TransformStream<Uint8Array, Uint8Array>();
  const stderr = new TransformStream<Uint8Array, Uint8Array>();

  const started = waitForStarted(starting);
  const exit = waitForExit(starting);

  // marks each rejection handled, so an exec that never starts raises no unhandled rejection
  void waitForSettled(started);
  void waitForSettled(exit);
  void startOutput(starting, 'stdout', stdout.writable);
  void startOutput(starting, 'stderr', stderr.writable);

  return {
    started,
    stdout: stdout.readable,
    stderr: stderr.readable,
    write: async (data) => {
      const exec = await starting;

      await exec.write(data);
    },
    closeStdin: async () => {
      const exec = await starting;

      await exec.closeStdin();
    },
    sendSignal: (signal) => void sendSignalOnStart(starting, signal),
    close: () => void stopOnStart(starting),
    exit,
  };
}

async function startAfter(wait: Promise<void>, start: () => ImpExec): Promise<ImpExec> {
  await wait;

  return start();
}

async function waitForStarted(starting: Promise<ImpExec>): Promise<unknown> {
  const exec = await starting;

  return exec.started;
}

async function waitForExit(starting: Promise<ImpExec>): ImpExec['exit'] {
  const exec = await starting;

  return exec.exit;
}

async function startOutput(
  starting: Promise<ImpExec>,
  channel: 'stdout' | 'stderr',
  writable: WritableStream<Uint8Array>,
): Promise<void> {
  try {
    const exec = await starting;

    await exec[channel].pipeTo(writable);
  } catch (error) {
    await stopOutput(writable, error);
  }
}

async function stopOutput(writable: WritableStream<Uint8Array>, error: unknown): Promise<void> {
  try {
    await writable.abort(error);
  } catch {
    // a pipe that failed partway has aborted its output already
  }
}

async function sendSignalOnStart(starting: Promise<ImpExec>, signal: string): Promise<void> {
  try {
    const exec = await starting;

    exec.sendSignal(signal);
  } catch {
    // an exec that never started has nothing to signal
  }
}

async function stopOnStart(starting: Promise<ImpExec>): Promise<void> {
  try {
    const exec = await starting;

    exec.close();
  } catch {
    // an exec that never started has nothing to close
  }
}
