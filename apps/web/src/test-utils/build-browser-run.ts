import { join } from 'node:path';

export interface BrowserRun {
  readonly runID: string;

  readonly runsDir: string;

  readonly runDir: string;

  readonly webDir: string;

  readonly webServerPath: string;

  readonly normalizeImagePath: string;

  readonly profilesDir: string;
}

const repoRoot = join(import.meta.dir, '..', '..', '..', '..');

// The run's folders live in the repo's git-ignored cache, not in TMPDIR, because a host's TMPDIR
// can sit in memory, and Chrome's profiles take megabytes.
export function buildBrowserRun(runID: string): BrowserRun {
  const runsDir = join(repoRoot, 'node_modules', '.cache', 'nixie-browser-runs');
  const runDir = join(runsDir, runID);
  const webDir = join(runDir, 'web');

  return {
    runID,
    runsDir,
    runDir,
    webDir,
    webServerPath: join(webDir, 'server', 'server.js'),
    normalizeImagePath: join(runDir, 'normalize-image.js'),
    profilesDir: join(runDir, 'profiles'),
  };
}
