import { join } from 'node:path';
import { findBrowserRun } from './find-browser-run';

// Bun runs one Chrome for the whole test process and the first view's options win, so every view
// opens through here. Chrome's sandbox needs user namespaces that a container or a root user
// lacks, and two Chromes cannot share a profile, so each test process gets its own.
export function createBrowserView(): Bun.WebView {
  const run = findBrowserRun(process.env);

  if (run === null) {
    throw new Error(
      'the browser suites open views in the run that `bun run test:browser` sets up, and NIXIE_BROWSER_RUN_ID names none',
    );
  }

  return new Bun.WebView({
    backend: { argv: ['--no-sandbox'], type: 'chrome', url: false },
    dataStore: { directory: join(run.profilesDir, String(process.pid)) },
  });
}
