import { expect, test } from 'bun:test';
import { startTestTriggers } from './start-test-triggers';

test('it gives the writer the time of the test clock', async () => {
  const triggers = await startTestTriggers();

  expect(triggers.writer.clock.now()).toBe(Date.parse('2027-03-09T00:00:00Z'));
});

test('it keeps the events that the core logs', async () => {
  const triggers = await startTestTriggers();

  triggers.core.logEvent('trigger_source.health', { source: 'schedule' });

  expect(triggers.logged).toStrictEqual([
    { event: 'trigger_source.health', fields: { source: 'schedule' } },
  ]);
});
