import type { JobConfig, ResticRepository } from './parse-job-config';

export interface ResticRun {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ResticRunOptions {
  readonly args: readonly string[];
  readonly stdin?: string;
}

// The password reaches restic through the child's environment alone, never its arguments, so no
// process listing shows it. The cache stays off, so no copy of a repository's index outlives a run.
export async function runRestic(
  config: Pick<JobConfig, 'restic' | 'backendEnv'>,
  repository: ResticRepository,
  options: ResticRunOptions,
): Promise<ResticRun> {
  const child = Bun.spawn([config.restic, '--no-cache', ...options.args], {
    env: {
      ...config.backendEnv,
      RESTIC_REPOSITORY: repository.repository,
      RESTIC_PASSWORD: repository.password,
    },
    stdin: options.stdin === undefined ? 'ignore' : Bun.file(options.stdin),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { exitCode, stdout, stderr };
}
