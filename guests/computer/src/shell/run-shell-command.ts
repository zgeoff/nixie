import type { ComputerReply } from '@heynixie/wire';
import { readCappedOutput } from './read-capped-output';

export interface ShellRun {
  readonly argv: readonly string[];
  readonly timeoutSeconds: number;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly isDiskNew: boolean;
}

const outputLimitBytes = 65_536;

// Runs one command to its exit, or kills it at its time limit. The reply's exit code is null for a
// command that the time limit or a signal ended.
export async function runShellCommand(run: ShellRun): Promise<ComputerReply> {
  const startedAtMs = performance.now();
  const [command = 'true', ...args] = run.argv;

  try {
    const child = Bun.spawn([command, ...args], {
      cwd: run.cwd,
      env: run.env,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, run.timeoutSeconds * 1000);

    const [stdout, stderr] = await Promise.all([
      readCappedOutput(child.stdout, outputLimitBytes),
      readCappedOutput(child.stderr, outputLimitBytes),
    ]);

    const exitCode = await child.exited;

    clearTimeout(timer);

    return {
      kind: 'run',
      ok: true,
      run: {
        exitCode: child.signalCode === null ? exitCode : null,
        stdout,
        stderr,
        seconds: Math.round(performance.now() - startedAtMs) / 1000,
        isDiskNew: run.isDiskNew,
      },
    };
  } catch (error) {
    return {
      kind: 'failed',
      ok: false,
      reason: 'failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
