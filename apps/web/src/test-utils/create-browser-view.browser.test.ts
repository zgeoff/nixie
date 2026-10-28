import { expect, onTestFinished, test } from 'bun:test';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { buildBrowserRun } from './build-browser-run';
import { checkBrowserSkip } from './check-browser-skip';

// Bun 1.4.2's skipIf takes a boolean and has no in-body skip, so the suite checks the browser
// before its tests start.
const browserSkip = await checkBrowserSkip();

// The run folder takes this process's ID, so the lane's start-of-run sweep removes it when a run
// dies before the cleanup.
function setupTest() {
  const run = buildBrowserRun(String(process.pid));

  onTestFinished(() => rm(run.runDir, { recursive: true, force: true }));

  return { run };
}

test.skipIf(browserSkip.isSkipped)(
  "it opens the Chrome of each load of the module in one process on a profile folder of its own in the run's folder",
  async () => {
    const ctx = setupTest();

    // Each query string loads the module afresh, as an isolated test file does, and closeAll stops
    // the first Chrome, as the end of a test file does. A Chrome that Bun starts before the last one
    // has exited closes its pipe at once, so the script waits for that exit.
    const modulePath = JSON.stringify(join(import.meta.dir, 'create-browser-view.ts'));

    const script = `const first = await import(${modulePath} + '?first');
      const firstView = first.createBrowserView();
      await firstView.navigate('about:blank');
      Bun.WebView.closeAll();
      while (Bun.spawnSync(['pgrep', '--parent', String(process.pid), 'chrom']).exitCode === 0) {
        await Bun.sleep(20);
      }
      const second = await import(${modulePath} + '?second');
      const secondView = second.createBrowserView();
      await secondView.navigate('about:blank');
      process.exit(0);`;

    const child = Bun.spawn([process.execPath, '-e', script], {
      env: { ...process.env, NIXIE_BROWSER_RUN_ID: ctx.run.runID },
      stdout: 'ignore',
    });

    onTestFinished(() => {
      child.kill();
    });

    await child.exited;

    const profiles = await readdir(ctx.run.profilesDir);

    const hasState = await Promise.all(
      profiles.map((profile) =>
        Bun.file(join(ctx.run.profilesDir, profile, 'Local State')).exists(),
      ),
    );

    expect(hasState).toStrictEqual([true, true]);
  },
);
