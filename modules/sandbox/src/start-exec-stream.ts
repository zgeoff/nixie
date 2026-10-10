import { encodeFrame, makeFrameDecoder } from '@heynixie/wire';
import { collectOutput } from './collect-output';
import { execOutputLimitBytes } from './exec-output-limit-bytes';
import type { ExecExit, ExecStream, StreamExit } from './types';

// A running process as an adapter sees it.
export interface ProcessIO {
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly write: (bytes: Uint8Array) => Promise<void>;
  readonly closeStdin: () => Promise<void>;
  readonly exit: Promise<ExecExit>;

  // sends SIGTERM and kills the process's cgroup after the grace; a second call does nothing more
  readonly stop: () => void;
}

// Puts a process behind framed messages: each send writes one frame to its stdin, and messages
// yields each frame from its stdout. A frame past maxMessageBytes stops the process and ends the
// iteration with FrameTooLargeError. stderr is collected, cut at the exec limit, for the exit.
export function startExecStream(io: ProcessIO, maxMessageBytes: number): ExecStream {
  const exit = waitForStreamExit(io);

  // a caller that never awaits the exit must not turn a failed session into an unhandled rejection
  void waitForSettled(exit);

  return {
    messages: readMessages(io, maxMessageBytes),
    send: (message) => io.write(encodeFrame(message)),
    exit,
    stop: () => {
      io.stop();
      return exit;
    },
  };
}

async function waitForStreamExit(io: ProcessIO): Promise<StreamExit> {
  const [ended, stderr] = await Promise.all([
    io.exit,
    collectOutput(io.stderr, execOutputLimitBytes),
  ]);

  return { ...ended, stderr };
}

async function* readMessages(
  io: ProcessIO,
  maxMessageBytes: number,
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const decode = makeFrameDecoder(maxMessageBytes);

  for await (const chunk of io.stdout) {
    yield* decodeOrStop(io, () => decode(chunk));
  }
}

// a frame past the limit stops the process before the error reaches the reader
function decodeOrStop(
  io: ProcessIO,
  decode: () => readonly Uint8Array<ArrayBuffer>[],
): readonly Uint8Array<ArrayBuffer>[] {
  try {
    return decode();
  } catch (error) {
    io.stop();
    throw error;
  }
}

async function waitForSettled(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // the caller who awaits the exit sees the error
  }
}
