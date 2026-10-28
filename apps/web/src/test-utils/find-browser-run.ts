import type { BrowserRun } from './build-browser-run';
import { buildBrowserRun } from './build-browser-run';

export function findBrowserRun(
  env: Readonly<Record<string, string | undefined>>,
): BrowserRun | null {
  const runID = env['NIXIE_BROWSER_RUN_ID'];

  return runID === undefined || runID === '' ? null : buildBrowserRun(runID);
}
