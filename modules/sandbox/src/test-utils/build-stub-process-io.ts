import type { ProcessIO } from '../start-exec-stream';
import type { ExecExit } from '../types';

interface StubProcessOutput {
  readonly stdout: readonly Uint8Array[];
  readonly stderr: readonly Uint8Array[];
}

interface StubProcessIO {
  readonly io: ProcessIO;

  // each write to stdin, in order
  readonly written: readonly Uint8Array[];

  // each signal a stop sent
  readonly signals: readonly string[];

  // ends the process with the exit, as a process that exits by itself does
  readonly end: (exit: ExecExit) => void;
}

// A process whose stdout and stderr hold the given chunks, then close. A stop sends SIGTERM once and
// ends the process with it, as an adapter's stop does; a second stop sends nothing more.
export function buildStubProcessIO(output: StubProcessOutput): StubProcessIO {
  const written: Uint8Array[] = [];
  const signals: string[] = [];
  const exit = Promise.withResolvers<ExecExit>();

  return {
    io: {
      stdout: buildStream(output.stdout),
      stderr: buildStream(output.stderr),
      write: (bytes) => {
        written.push(bytes);

        return Promise.resolve();
      },
      closeStdin: () => Promise.resolve(),
      exit: exit.promise,
      stop: () => {
        if (signals.length > 0) {
          return;
        }

        signals.push('SIGTERM');
        exit.resolve({ code: null, signal: 'SIGTERM' });
      },
    },
    written,
    signals,
    end: exit.resolve,
  };
}

function buildStream(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start: (controller) => {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  });
}
