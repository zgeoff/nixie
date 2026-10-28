// A Chrome cold start on a fresh CI runner can run past the test timeout, so the preload starts
// it before the first test. Bun keeps that Chrome for the whole process.

import { checkBrowserSkip } from './check-browser-skip';
import { findBrowserRun } from './find-browser-run';

const run = findBrowserRun(process.env);

if (run === null) {
  throw new Error(
    'the browser preload needs the run that `bun run test:browser` builds, and NIXIE_BROWSER_RUN_ID names none',
  );
}

const builds = [run.webServerPath, run.normalizeImagePath];

const isBuilt = await Promise.all(builds.map((path) => Bun.file(path).exists()));

const missing = builds.filter((_, index) => isBuilt[index] !== true);

if (missing.length > 0) {
  throw new Error(
    `the browser run ${run.runID} has no build at ${missing.join(', ')}; run the suites with \`bun run test:browser\``,
  );
}

await checkBrowserSkip();
