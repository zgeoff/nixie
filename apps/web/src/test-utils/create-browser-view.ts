import { join } from 'node:path';
import { findBrowserRun } from './find-browser-run';

// `bun test --parallel=1` runs the files one after another in one process, and its isolation
// stops each file's Chrome and loads this module again for the next file. A new Chrome on the last
// one's profile can start before the last one lets go of it, so each file's Chrome gets its own.
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
