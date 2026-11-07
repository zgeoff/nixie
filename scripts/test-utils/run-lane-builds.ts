type Env = Readonly<Record<string, string | undefined>>;

// A build outlasts a test's limit on a small host, so a lane's start hook runs each package script
// that writes a build before the lane's tests read it.
export function runLaneBuilds(env: Env, scripts: readonly string[]): void {
  for (const script of scripts) {
    const result = Bun.spawnSync(['bun', 'run', script], {
      env: { ...env },
      stdin: 'ignore',
      stdout: 'inherit',
      stderr: 'inherit',
    });

    if (result.exitCode !== 0) {
      throw new Error(`bun run ${script} exited with ${result.exitCode}`);
    }
  }
}
