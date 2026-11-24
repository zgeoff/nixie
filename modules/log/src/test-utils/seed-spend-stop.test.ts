import { expect, test } from 'bun:test';
import { readSpendStopSince } from '../pause/read-spend-stop-since';
import { buildLogSeeder } from './build-log-seeder';
import { startTestLog } from './start-test-log';

test('it seeds a standing stop that the stop read finds', async () => {
  const log = await startTestLog();

  const seed = buildLogSeeder(log);

  await seed.spendStop();

  const since = await readSpendStopSince(log.writer.db);

  expect(since).toBe(log.clock.now());
});
