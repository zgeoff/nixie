import { expect, onTestFinished, test } from 'bun:test';
import { TEST_TOKEN } from '@impz/testing';
import { buildImpPort } from '../sandbox/build-imp-port';
import { buildUnenforcedEgressPort } from './build-unenforced-egress-port';
import { startImpd } from './start-impd';

async function setupTest() {
  const impd = await startImpd({ features: { backupOptOut: false } });

  onTestFinished(impd.stop);

  const port = buildImpPort({ url: impd.url, token: TEST_TOKEN });

  return { port, unenforced: buildUnenforcedEgressPort(port) };
}

test('it reports an impd that does not enforce egress', async () => {
  const ctx = await setupTest();

  expect(ctx.port.readFeatures()).resolves.toMatchObject({ isEgressEnforced: true });
  expect(ctx.unenforced.readFeatures()).resolves.toMatchObject({ isEgressEnforced: false });
});

test('it keeps the other features as impd reports them', async () => {
  const ctx = await setupTest();

  expect(ctx.unenforced.readFeatures()).resolves.toStrictEqual({
    publicEgress: true,
    isEgressEnforced: false,
    hasBackupOptOut: false,
  });
});
