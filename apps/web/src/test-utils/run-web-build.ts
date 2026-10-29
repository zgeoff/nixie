import { join } from 'node:path';
import { buildWebBuildEnv } from './build-web-build-env';

const webDir = join(import.meta.dir, '..', '..');

export async function runWebBuild(outDir: string): Promise<void> {
  const child = Bun.spawn(['bun', 'run', 'build', '--outDir', outDir], {
    cwd: webDir,
    env: buildWebBuildEnv(process.env),
    stderr: 'pipe',
    stdout: 'ignore',
  });

  // A full stderr pipe stops the build, so the run reads it while the build runs.
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);

  if (exitCode !== 0) {
    throw new Error(`the web build failed:\n${stderr}`);
  }
}
