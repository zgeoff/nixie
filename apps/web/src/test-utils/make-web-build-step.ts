import { dirname, join } from 'node:path';
import type { BrowserRun } from './build-browser-run';

const webDir = join(import.meta.dir, '..', '..');

export function makeWebBuildStep(
  buildCommand: readonly string[],
): (run: BrowserRun, signal: AbortSignal) => Promise<number> {
  return async (run, signal) => {
    const child = Bun.spawn([...buildCommand, '--outDir', run.webDir], {
      cwd: webDir,
      signal,
      stderr: 'inherit',
      stdout: 'inherit',
    });

    const exitCode = await child.exited;

    if (exitCode !== 0 || signal.aborted) {
      return exitCode;
    }

    await Bun.build({
      entrypoints: [join(webDir, 'src', 'normalize-image.ts')],
      format: 'esm',
      naming: 'normalize-image.js',
      outdir: dirname(run.normalizeImagePath),
      target: 'browser',
    });

    return 0;
  };
}
