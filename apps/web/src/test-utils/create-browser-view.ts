import { join } from 'node:path';
import { findBrowserRun } from './find-browser-run';

// Bun runs one Chrome for each process that loads this module, and a test's child process loads it
// in the same run. Chrome refuses a profile that another Chrome still holds, so each load gets its
// own.
const profileName = crypto.randomUUID();

// The first view's options win, so every view opens here. The sandbox needs user namespaces that a
// container lacks. A killed Chrome leaves its shared memory files, so they go to the TMPDIR that
// the lane removes, in place of /dev/shm.
export function createBrowserView(): Bun.WebView {
  const run = findBrowserRun(process.env);

  if (run === null) {
    throw new Error(
      'the browser suites open views in the run that `bun run test:browser` sets up, and NIXIE_BROWSER_RUN_ID names none',
    );
  }

  return new Bun.WebView({
    backend: { argv: ['--no-sandbox', '--disable-dev-shm-usage'], type: 'chrome', url: false },
    dataStore: { directory: join(run.profilesDir, profileName) },
  });
}
