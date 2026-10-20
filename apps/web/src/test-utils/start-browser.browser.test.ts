import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { checkBrowserSkip } from './check-browser-skip';

// Bun 1.4.2's skipIf takes a boolean and has no in-body skip. Outside CI these tests skip when no
// browser starts, and the run prints why; CI always runs them.
const browserSkip = await checkBrowserSkip();

test.skipIf(browserSkip.isSkipped)(
  'it leaves Chrome running for the views the tests open',
  async () => {
    // a fresh process, so no other suite's view can supply the Chrome
    const child = Bun.spawn(
      [
        process.execPath,
        '-e',
        `await import(${JSON.stringify(join(import.meta.dir, 'start-browser.ts'))});
      console.log(Bun.spawnSync(['pgrep', '--parent', String(process.pid), '--list-name']).stdout.toString());
      process.exit(0);`,
      ],
      { stdout: 'pipe' },
    );

    onTestFinished(() => {
      child.kill();
    });

    const children = await new Response(child.stdout).text();

    expect(children).toMatch(/chrom/u);
  },
);
