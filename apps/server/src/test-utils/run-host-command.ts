import { onTestFinished } from 'bun:test';
import { join } from 'node:path';

export interface HostCommandRun {
  readonly exitCode: number;
  readonly stdout: string;
}

// Runs one host command of the test build as its own process against the configuration given, as
// a shell in nixie's container runs it, and returns its exit code and its stdout. A test that fails
// before the command exits kills it.
export async function runHostCommand(
  configPath: string,
  args: readonly string[],
): Promise<HostCommandRun> {
  const command = Bun.spawn(
    [
      process.execPath,
      '--define',
      'NIXIE_TEST_BUILD=true',
      join(import.meta.dir, '..', 'main.ts'),
      ...args,
      '--config',
      configPath,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );

  onTestFinished(() => {
    command.kill();
  });

  const [exitCode, stdout] = await Promise.all([
    command.exited,
    new Response(command.stdout).text(),
  ]);

  return { exitCode, stdout };
}
