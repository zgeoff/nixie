import { waitForSettled } from '@heynixie/async';
import { encodeFrame, makeFrameDecoder } from '@heynixie/wire';
import { execOutputLimitBytes } from './exec-output-limit-bytes';
import { readStreamOutput } from './read-stream-output';
import type { ExecExit, ExecStream, StreamExit } from './types';

export interface ProcessIO {
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly write: (bytes: Uint8Array) => Promise<void>;
  readonly closeStdin: () => Promise<void>;
  readonly exit: Promise<ExecExit>;

  readonly stop: () => void;
}

export function startExecStream(io: ProcessIO, maxMessageBytes: number): ExecStream {
  const exit = waitForStreamExit(io);

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
    readStreamOutput(io.stderr, execOutputLimitBytes),
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
