import { dirname, join } from 'node:path';
import type { BrowserBuild } from './read-browser-build';
import { readBrowserBuild } from './read-browser-build';

const webDir = join(import.meta.dir, '..', '..');

// rig's browser lane runs this as `build:browser` once before the suites, and stops its process
// group when the lane is stopped.
export async function writeBrowserBuild(
  build: BrowserBuild,
  buildCommand: readonly string[],
): Promise<number> {
  const child = Bun.spawn([...buildCommand, '--outDir', build.webDir], {
    cwd: webDir,
    stderr: 'inherit',
    stdout: 'inherit',
  });

  const exitCode = await child.exited;

  if (exitCode !== 0) {
    return exitCode;
  }

  await Bun.build({
    entrypoints: [join(webDir, 'src', 'normalize-image.ts')],
    format: 'esm',
    naming: 'normalize-image.js',
    outdir: dirname(build.normalizeImagePath),
    target: 'browser',
  });

  return 0;
}

if (import.meta.main) {
  process.exitCode = await writeBrowserBuild(readBrowserBuild(), ['bun', 'run', 'build']);
}
