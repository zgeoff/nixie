import { expect, test } from 'bun:test';

test('it leaves Chrome running for the views the tests open', async () => {
  await import('./start-browser');

  const children = Bun.spawnSync(['pgrep', '--parent', String(process.pid), '--list-name']);

  expect(children.stdout.toString()).toMatch(/chrom/u);
});
