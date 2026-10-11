import { buildKubectlArgv } from './build-kubectl-argv';
import type { KubectlTarget } from './parse-live-env';

// A kubectl command that streams, such as `logs --follow` or `get --watch`, and the lines it has
// printed so far.
export interface KubectlStream {
  readonly lines: readonly string[];

  // resolves with the exit code once the command ends, on its own or after stop
  readonly exited: Promise<number>;
  readonly stop: () => Promise<number>;
}

// Starts a kubectl command that streams, and gathers its stdout line by line as it arrives, so a
// check can read the log of a pod that the cluster deletes while the stream runs.
export function startKubectl(target: KubectlTarget, args: readonly string[]): KubectlStream {
  const child = Bun.spawn(buildKubectlArgv(target, args), {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
  });
  const lines: string[] = [];
  const read = readLines(child.stdout, (line) => {
    lines.push(line);
  });
  const exited = waitForExit(child.exited, read);

  return {
    lines,
    exited,
    stop: () => {
      child.kill('SIGTERM');
      return exited;
    },
  };
}

async function waitForExit(code: Promise<number>, read: Promise<void>): Promise<number> {
  const [exitCode] = await Promise.all([code, read]);

  return exitCode;
}

async function readLines(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  const pending = { text: '' };

  for await (const chunk of stream) {
    pending.text = emitCompleteLines(
      pending.text + decoder.decode(chunk, { stream: true }),
      onLine,
    );
  }
  pending.text += decoder.decode();
  if (pending.text !== '') {
    onLine(pending.text);
  }
}

// hands on every complete line and returns the partial line after the last newline
function emitCompleteLines(text: string, onLine: (line: string) => void): string {
  const parts = text.split('\n');
  const rest = parts.pop() ?? '';

  for (const line of parts) {
    onLine(line);
  }
  return rest;
}
