import { join } from 'node:path';
import { createNixieChannel } from './create-nixie-channel';
import { harnessEnv } from './harness-env';
import { readDescendants } from './read-descendants';
import { stopProcesses } from './stop-processes';
import type { FaultPointArm, FaultPointWork, NixieMessage } from './types';

export interface NixieProcessOptions {
  readonly entry: string;
  readonly env: Readonly<Record<string, string>>;

  readonly clockMs: number;

  readonly faultPoints?: readonly FaultPointArm[];
}

export interface FaultPointArrival {
  readonly arrivalID: number;
  readonly point: string;
  readonly work: FaultPointWork;
}

export interface NixieExit {
  readonly code: number | null;
  readonly signal: string | null;
}

export interface NixieProcess {
  readonly pid: number;

  readonly ready: Promise<void>;
  readonly exited: Promise<NixieExit>;

  readonly readStderr: () => string;

  readonly waitForArrival: (point: string, workID?: string) => Promise<FaultPointArrival>;
  readonly release: (arrival: FaultPointArrival) => void;

  readonly request: (operation: string, args: unknown) => Promise<unknown>;

  readonly kill: () => Promise<NixieExit>;
  readonly signal: (signal: 'SIGTERM' | 'SIGSTOP' | 'SIGCONT') => void;
}

export function startNixieProcess(options: NixieProcessOptions): NixieProcess {
  const channel = createNixieChannel();
  const child = startChild(options, channel.receive);
  const stderr = startTextReader(child.stderr);

  const exited = waitForExit(child, stderr.done, (exit) => {
    channel.close(new Error(`nixie exited with ${formatExit(exit)}: ${stderr.read()}`));
  });

  return {
    pid: child.pid,
    ready: channel.ready,
    exited,
    readStderr: stderr.read,
    waitForArrival: channel.waitForArrival,
    release: (arrival) => {
      child.send({ type: 'release', arrivalID: arrival.arrivalID });
    },
    request: (operation, args) =>
      channel.sendRequest(
        (message) => {
          child.send(message);
        },
        operation,
        args,
      ),
    kill: () => {
      const descendants = readDescendants(child.pid);

      child.kill('SIGKILL');

      stopProcesses(descendants);

      return exited;
    },
    signal: (signal) => {
      child.kill(signal);
    },
  };
}

const defineTestBuildPath = join(import.meta.dir, 'define-test-build.ts');

function startChild(options: NixieProcessOptions, receive: (message: NixieMessage) => void) {
  return Bun.spawn([process.execPath, '--preload', defineTestBuildPath, options.entry], {
    env: {
      ...process.env,
      ...options.env,
      [harnessEnv.clockMs]: String(options.clockMs),
      [harnessEnv.faultPoints]: JSON.stringify(options.faultPoints ?? []),
    },
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe',
    serialization: 'json',
    ipc: receive,
  });
}

interface CollectedText {
  readonly read: () => string;

  readonly done: Promise<void>;
}

function startTextReader(stream: ReadableStream<Uint8Array>): CollectedText {
  const text = { value: '' };

  const decoder = new TextDecoder();

  const done = (async () => {
    for await (const chunk of stream) {
      text.value += decoder.decode(chunk, { stream: true });
    }
  })();

  return { read: () => text.value, done };
}

type NixieChild = ReturnType<typeof startChild>;

type OnExit = (exit: NixieExit) => void;

// Bun can report the exit before the last of stderr is read, so the wait covers both.
async function waitForExit(
  child: NixieChild,
  stderrDone: Promise<void>,
  onExit: OnExit,
): Promise<NixieExit> {
  await Promise.all([child.exited, stderrDone]);

  // Bun reports a signal with no name, such as a real-time one, as its number.
  const signal = child.signalCode === null ? null : String(child.signalCode);
  const exit = { code: child.exitCode, signal };

  onExit(exit);

  return exit;
}

function formatExit(exit: NixieExit): string {
  return exit.signal === null ? `code ${exit.code}` : `signal ${exit.signal}`;
}
