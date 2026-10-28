import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkBrowserSkip } from './check-browser-skip';

// Bun 1.4.2's skipIf takes a boolean and has no in-body skip, so the suite checks the browser
// before its tests start.
const browserSkip = await checkBrowserSkip();

// The preloads point TMPDIR at memory, and a Chrome leaves its socket folder there, so the child's
// Chrome gets a temp folder of its own, which the test removes.
async function setupTest() {
  const chromeTmpdir = await mkdtemp(join(tmpdir(), 'nixie-chrome-'));

  onTestFinished(() => rm(chromeTmpdir, { recursive: true, force: true }));

  return { chromeTmpdir };
}

test.skipIf(browserSkip.isSkipped)(
  'it leaves Chrome running for the views the tests open',
  async () => {
    const ctx = await setupTest();

    const child = Bun.spawn(
      [
        process.execPath,
        '-e',
        `await import(${JSON.stringify(join(import.meta.dir, 'start-browser.ts'))});
      console.log(Bun.spawnSync(['pgrep', '--parent', String(process.pid), '--list-name']).stdout.toString());
      Bun.WebView.closeAll();
      while (Bun.spawnSync(['pgrep', '--parent', String(process.pid), 'chrom']).exitCode === 0) {
        await Bun.sleep(20);
      }
      process.exit(0);`,
      ],
      { env: { ...process.env, TMPDIR: ctx.chromeTmpdir }, stdout: 'pipe' },
    );

    onTestFinished(() => {
      child.kill();
    });

    const children = await new Response(child.stdout).text();

    expect(children).toMatch(/chrom/u);
  },
);

test.skipIf(browserSkip.isSkipped)('it refuses a process that names no browser run', async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      '-e',
      `await import(${JSON.stringify(join(import.meta.dir, 'start-browser.ts'))});`,
    ],
    { env: { ...process.env, NIXIE_BROWSER_RUN_ID: '' }, stderr: 'pipe', stdout: 'ignore' },
  );

  onTestFinished(() => {
    child.kill();
  });

  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);

  expect(stderr).toInclude('NIXIE_BROWSER_RUN_ID names none');
  expect(exitCode).toBe(1);
});

test.skipIf(browserSkip.isSkipped)('it refuses a run whose build is missing', async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      '-e',
      `await import(${JSON.stringify(join(import.meta.dir, 'start-browser.ts'))});`,
    ],
    {
      env: { ...process.env, NIXIE_BROWSER_RUN_ID: 'no-such-run' },
      stderr: 'pipe',
      stdout: 'ignore',
    },
  );

  onTestFinished(() => {
    child.kill();
  });

  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);

  expect(stderr).toInclude('the browser run no-such-run has no build at ');
  expect(exitCode).toBe(1);
});
