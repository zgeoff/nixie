import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildBrowserRun } from './build-browser-run';

test("it puts each of the run's folders and files in the run's own folder of the repo's cache", () => {
  const runsDir = join(import.meta.dir, '..', '..', '..', '..', 'node_modules', '.cache');

  expect(buildBrowserRun('4417')).toStrictEqual({
    runID: '4417',
    runsDir: join(runsDir, 'nixie-browser-runs'),
    runDir: join(runsDir, 'nixie-browser-runs', '4417'),
    webDir: join(runsDir, 'nixie-browser-runs', '4417', 'web'),
    webServerPath: join(runsDir, 'nixie-browser-runs', '4417', 'web', 'server', 'server.js'),
    normalizeImagePath: join(runsDir, 'nixie-browser-runs', '4417', 'normalize-image.js'),
    profilesDir: join(runsDir, 'nixie-browser-runs', '4417', 'profiles'),
  });
});
