import { expect, test } from 'bun:test';
import { healthReportSchema } from './health-report-schema';

test('it accepts a degraded readiness answer with its dependency and advisory parts', () => {
  const result = healthReportSchema.safeParse({
    status: 'degraded',
    parts: { database: { isReady: true, reason: null } },
    dependencies: { imp_host: { isReady: false, reason: 'the check took longer than 2000 ms' } },
    advisory: { conversation_turns: { isReady: true, reason: null } },
  });

  expect(result.data).toStrictEqual({
    status: 'degraded',
    parts: { database: { isReady: true, reason: null } },
    dependencies: { imp_host: { isReady: false, reason: 'the check took longer than 2000 ms' } },
    advisory: { conversation_turns: { isReady: true, reason: null } },
  });
});

test('it accepts a liveness answer with no dependency or advisory parts', () => {
  const result = healthReportSchema.safeParse({
    status: 'ready',
    parts: { process: { isReady: true, reason: null } },
  });

  expect(result.data).toStrictEqual({
    status: 'ready',
    parts: { process: { isReady: true, reason: null } },
  });
});

test('it rejects a status the health endpoint never reports', () => {
  const result = healthReportSchema.safeParse({
    status: 'starting',
    parts: { database: { isReady: true, reason: null } },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['status'] });
});

test('it rejects a part report without its reason', () => {
  const result = healthReportSchema.safeParse({
    status: 'ready',
    parts: { database: { isReady: true } },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['parts', 'database', 'reason'] });
});
