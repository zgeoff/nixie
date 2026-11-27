import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { readPackageCard } from '../package/package-card';
import { seedPackageCard } from './seed-package-card';
import { startTestDevicesAPI } from './start-test-devices-api';

function setupTest() {
  return startTestDevicesAPI();
}

test('it seeds the call of a package install with its card, and a proposal that follows it', async () => {
  const ctx = await setupTest();

  await seedPackageCard(ctx.context);

  const entries = await readRecords(ctx.context.log, { afterSequence: 0 });
  const card = await readPackageCard(ctx.context.log, entries[0]?.record.sequence ?? 0);

  expect(entries.map((entry) => entry.record.kind)).toStrictEqual([
    'tool_called',
    'policy.action_proposed',
  ]);

  expect(card).toMatchObject({ name: 'chart.js', version: '4.4.6', publisher: 'a-publisher' });
});
