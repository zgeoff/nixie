import { expect, test } from 'bun:test';
import { buildStartStatus } from './build-start-status';

test.each([
  [
    { kind: 'first' } as const,
    'first',
    'Start: a new session. Earlier history is in the event log.',
  ],
  [
    { kind: 'compaction' } as const,
    'compaction',
    'Start: after a compaction. The summary below is yours, written as the earlier session closed, and it covers every turn of that session. Earlier history is in the event log.',
  ],
  [
    { kind: 'rebuild', reason: 'lost', lostSessionID: 'a-lost-session' } as const,
    'rebuild:lost',
    'Start: a rebuild, because the earlier session was lost. Earlier history is in the event log.',
  ],
  [
    { kind: 'rebuild', reason: 'forget', lostSessionID: null } as const,
    'rebuild:forget',
    'Start: a rebuild after a forget. The forget erased the summary of earlier sessions, so the gap is deliberate. Earlier history is in the event log.',
  ],
])('it reads the start %o as %s', async (start, value, text) => {
  const line = await buildStartStatus().read({
    start,
    openedAt: new Date('2026-10-14T11:50:00Z'),
    times: { defaultZone: 'UTC', now: new Date('2026-10-14T11:50:00Z') },
    model: 'claude-test-1',
  });

  expect(line).toStrictEqual({ value, text });
});
