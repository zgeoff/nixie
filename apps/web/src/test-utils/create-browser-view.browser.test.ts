import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { checkBrowserSkip } from './check-browser-skip';
import { createBrowserView } from './create-browser-view';
import { findBrowserRun } from './find-browser-run';

// Bun 1.4.2's skipIf takes a boolean and has no in-body skip, so the suite checks the browser
// before its tests start.
const browserSkip = await checkBrowserSkip();

test.skipIf(browserSkip.isSkipped)(
  "it keeps Chrome's profile in this test process's folder of the run",
  async () => {
    const run = findBrowserRun(process.env);

    invariant(run !== null, 'the browser preload refuses a process with no browser run');

    const view = createBrowserView();

    onTestFinished(() => {
      view.close();
    });

    await view.navigate('about:blank');

    const hasProfile = await Bun.file(
      join(run.profilesDir, String(process.pid), 'Local State'),
    ).exists();

    expect(hasProfile).toBeTrue();
  },
);
