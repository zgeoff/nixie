import { join } from 'node:path';
import { findBrowserRun } from './find-browser-run';

// `bun test --parallel=1` runs the files one after another in one process, and its isolation
// stops each file's Chrome and loads this module again for the next file. A new Chrome on the last
// one's profile can start before the last one lets go of it, so each file's Chrome gets its own.
const profileName = crypto.randomUUID();

// Bun runs one Chrome for each test file and the first view's options win, so every view opens
// through here. Chrome's sandbox needs user namespaces that a container or a root user lacks.
export function createBrowserView(): Bun.WebView {
  const run = findBrowserRun(process.env);

  if (run === null) {
    throw new Error(
      'the browser suites open views in the run that `bun run test:browser` sets up, and NIXIE_BROWSER_RUN_ID names none',
    );
  }

  return new Bun.WebView({
    backend: { argv: ['--no-sandbox'], type: 'chrome', url: false },
    dataStore: { directory: join(run.profilesDir, profileName) },
  });
}
