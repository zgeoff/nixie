import { expect, test } from 'bun:test';
import { buildTestTriggerCore } from './build-test-trigger-core';
import { startTestTriggers } from './start-test-triggers';

test('it takes the log, the writer clock and the definitions of the tasks context', async () => {
  const triggers = await startTestTriggers();

  const core = buildTestTriggerCore(triggers.context);

  expect([core.log, core.clock, core.definitions()]).toStrictEqual([
    triggers.context.log,
    triggers.context.log.writer.clock,
    triggers.context.definitions(),
  ]);
});

test('it passes the events that the core logs to the logger', async () => {
  const triggers = await startTestTriggers();

  const logged: string[] = [];

  const core = buildTestTriggerCore(triggers.context, (event) => {
    logged.push(event);
  });

  core.logEvent('trigger.source_unhealthy', {});

  expect(logged).toStrictEqual(['trigger.source_unhealthy']);
});
