import { expect, test } from 'bun:test';
import { buildStartTimeStatus } from './build-start-time-status';

test('it labels the status time as the time the session started, never the time now', async () => {
  const line = await buildStartTimeStatus().read({
    start: { kind: 'first' },
    openedAt: new Date('2026-10-14T11:50:00Z'),
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-14T11:50:00Z') },
    model: 'claude-test-1',
  });

  expect(line).toStrictEqual({
    value: '2026-10-14T11:50:00.000Z',
    text: 'Session started: Wed 14 Oct, 22:50, Sydney. Each message carries its own time.',
  });
});
