import { collectOutput } from './collect-output';
import { execOutputLimitBytes } from './exec-output-limit-bytes';
import type { ProcessIO } from './start-exec-stream';
import type { ExecResult } from './types';

// Runs a started process to its exit: it writes stdin and closes it, collects both outputs cut at
// the exec limit, and stops the process when the signal aborts.
export async function runCommand(
  io: ProcessIO,
  stdin: Uint8Array | undefined,
  signal: AbortSignal | undefined,
): Promise<ExecResult> {
  const startedAt = performance.now();
  const stopOnAbort = (): void => {
    io.stop();
  };

  if (signal?.aborted === true) {
    io.stop();
  }
  signal?.addEventListener('abort', stopOnAbort, { once: true });
  try {
    const [stdout, stderr, exit] = await Promise.all([
      collectOutput(io.stdout, execOutputLimitBytes),
      collectOutput(io.stderr, execOutputLimitBytes),
      io.exit,
      writeStdin(io, stdin),
    ]);

    return { ...exit, stdout, stderr, durationMs: performance.now() - startedAt };
  } finally {
    signal?.removeEventListener('abort', stopOnAbort);
  }
}

// A command that exits or closes stdin before it reads all of it fails the write. Its exit and
// output are the result, so the write error never replaces them.
async function writeStdin(io: ProcessIO, stdin: Uint8Array | undefined): Promise<void> {
  try {
    if (stdin !== undefined && stdin.byteLength > 0) {
      await io.write(stdin);
    }
    await io.closeStdin();
  } catch {
    // the exit reports what happened
  }
}
