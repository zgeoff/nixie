import { onTestFinished } from 'bun:test';
import { join } from 'node:path';

export interface HostCommandRun {
  readonly exitCode: number;
  readonly stdout: string;
}

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
    new Response(command.stderr).text(),
  ]);

  return { exitCode, stdout };
}
