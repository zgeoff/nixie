import { join } from 'node:path';
import { buildNixieChannel } from './build-nixie-channel';
import { collectDescendants } from './collect-descendants';
import { harnessEnv } from './harness-env';
import { stopProcesses } from './stop-processes';
import type { FaultPointArm, FaultPointWork, NixieMessage } from './types';

export interface NixieProcessOptions {
  // the program that composes a test build of nixie and starts a harness link
  readonly entry: string;
  readonly env: Readonly<Record<string, string>>;

  // the clock's time at start, in ms since the epoch
  readonly clockMs: number;

  // fault points held from the start, such as a recovery step
  readonly faultPoints?: readonly FaultPointArm[];
}

// A runner that nixie holds at an armed fault point.
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

  // resolves once nixie has recovered and started its runners
  readonly ready: Promise<void>;
  readonly exited: Promise<NixieExit>;

  // everything nixie wrote to stderr so far
  readonly readStderr: () => string;

  // the first arrival at the point, of one piece of work when workID is given, that no earlier
  // wait took
  readonly waitForArrival: (point: string, workID?: string) => Promise<FaultPointArrival>;
  readonly release: (arrival: FaultPointArrival) => void;

  // runs one operation in nixie, such as advance or arm, and returns its result
  readonly request: (operation: string, args: unknown) => Promise<unknown>;

  // SIGKILL to nixie and to every process it started, which nixie's own process groups would
  // otherwise leave running; resolves once nixie has exited
  readonly kill: () => Promise<NixieExit>;
  readonly signal: (signal: 'SIGTERM' | 'SIGSTOP' | 'SIGCONT') => void;
}

// Starts a test build of nixie as a child process with an IPC channel to the harness. Its stdout
// is dropped and its stderr is kept, so a test can name why nixie exited.
export function startNixieProcess(options: NixieProcessOptions): NixieProcess {
  const channel = buildNixieChannel();
  const child = startChild(options, channel.receive);
  const stderr = collectText(child.stderr);

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
      const descendants = collectDescendants(child.pid);

      child.kill('SIGKILL');

      stopProcesses(descendants);

      return exited;
    },
    signal: (signal) => {
      child.kill(signal);
    },
  };
}

// the preload defines NIXIE_TEST_BUILD in nixie as the test runner does in the tests
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

type NixieChild = ReturnType<typeof startChild>;

type OnExit = (exit: NixieExit) => void;

// The exit can land before the last of stderr is read, so it waits for both: the message then holds
// everything nixie wrote before it exited.
async function waitForExit(
  child: NixieChild,
  stderrDone: Promise<void>,
  onExit: OnExit,
): Promise<NixieExit> {
  await Promise.all([child.exited, stderrDone]);

  const exit = { code: child.exitCode, signal: child.signalCode };

  onExit(exit);

  return exit;
}

interface CollectedText {
  readonly read: () => string;

  // resolves once the stream has ended and every chunk is read
  readonly done: Promise<void>;
}

function collectText(stream: ReadableStream<Uint8Array>): CollectedText {
  const text = { value: '' };

  const decoder = new TextDecoder();

  const done = (async () => {
    for await (const chunk of stream) {
      text.value += decoder.decode(chunk, { stream: true });
    }
  })();

  return { read: () => text.value, done };
}

function formatExit(exit: NixieExit): string {
  return exit.signal === null ? `code ${exit.code}` : `signal ${exit.signal}`;
}
