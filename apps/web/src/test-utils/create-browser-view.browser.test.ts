import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBrowserRun } from './build-browser-run';
import { checkBrowserSkip } from './check-browser-skip';

// Bun 1.4.2's skipIf takes a boolean and has no in-body skip, so the suite checks the browser
// before its tests start.
const browserSkip = await checkBrowserSkip();

// The run folder takes this process's ID, so the lane's start-of-run sweep removes it when a run
// dies before the cleanup. The preloads point TMPDIR at memory, so the child's Chrome gets a temp
// folder of its own, which the test removes.
async function setupTest() {
  const run = buildBrowserRun(String(process.pid));

  onTestFinished(() => rm(run.runDir, { recursive: true, force: true }));

  const chromeTmpdir = await mkdtemp(join(tmpdir(), 'nixie-chrome-'));

  onTestFinished(() => rm(chromeTmpdir, { recursive: true, force: true }));

  return { chromeTmpdir, run };
}

test.skipIf(browserSkip.isSkipped)(
  "it opens the Chrome of each load of the module in one process on a profile folder of its own in the run's folder",
  async () => {
    const ctx = await setupTest();

    // Each query string loads the module afresh and closeAll stops its Chrome, as a test file's
    // start and end do. A Chrome started before the last one exits closes its pipe at once, and an
    // exiting Chrome still writes to its folders, so the script waits for each exit.
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
      Bun.WebView.closeAll();
      while (Bun.spawnSync(['pgrep', '--parent', String(process.pid), 'chrom']).exitCode === 0) {
        await Bun.sleep(20);
      }
      process.exit(0);`;

    const child = Bun.spawn([process.execPath, '-e', script], {
      env: { ...process.env, NIXIE_BROWSER_RUN_ID: ctx.run.runID, TMPDIR: ctx.chromeTmpdir },
      stdout: 'ignore',
    });

    onTestFinished(() => {
      child.kill();
    });

    await child.exited;

    const profiles = await readdir(ctx.run.profilesDir);

    // Chrome delays its write of the Local State file, and a CI run found one folder without it, so
    // the test counts the entries that Chrome makes in a profile folder as it starts.
    const entryCounts = await Promise.all(
      profiles.map(async (profile) => {
        const entries = await readdir(join(ctx.run.profilesDir, profile));

        return entries.length;
      }),
    );

    expect(entryCounts).toSatisfyAll((count: number) => count > 0);
    expect(entryCounts).toHaveLength(2);
  },
);
