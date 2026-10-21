import { execOutputLimitBytes } from './exec-output-limit-bytes';
import { readStreamOutput } from './read-stream-output';
import type { ProcessIO } from './start-exec-stream';
import type { ExecResult } from './types';

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
      readStreamOutput(io.stdout, execOutputLimitBytes),
      readStreamOutput(io.stderr, execOutputLimitBytes),
      io.exit,
      writeStdin(io, stdin),
    ]);

    return { ...exit, stdout, stderr, durationMs: performance.now() - startedAt };
  } finally {
    signal?.removeEventListener('abort', stopOnAbort);
  }
}

async function writeStdin(io: ProcessIO, stdin: Uint8Array | undefined): Promise<void> {
  try {
    if (stdin !== undefined && stdin.byteLength > 0) {
      await io.write(stdin);
    }

    await io.closeStdin();
  } catch {}
}
