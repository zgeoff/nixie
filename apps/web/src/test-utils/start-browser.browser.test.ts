import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';

test('it leaves Chrome running for the views the tests open', async () => {
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
});
