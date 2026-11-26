import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderHandoverClosed } from './render-handover-closed';

function setupTest() {
  return {
    times: { defaultZone: 'Europe/London', now: new Date('2026-03-03T09:13:00Z') },
    buildClosed: (by: 'assistant' | 'expired', waitedSeconds: number) =>
      buildMockLogRecord({
        sequence: 92,
        kind: 'computer.handover_closed',
        thread: 'conversation',
        recordedAt: new Date('2026-03-03T09:12:30Z'),
        payload: { shortID: '88', by, waitedSeconds },
      }),
  };
}

test('it tells the assistant that its ask lapsed, and after how long', () => {
  const ctx = setupTest();

  expect(renderHandoverClosed(ctx.buildClosed('expired', 3600), ctx.times, 'Sam')).toInclude(
    '[#92] Your handover ask lapsed after 60 min with no take-over.',
  );
});

test('it tells the assistant that it withdrew its ask, in the owner’s name', () => {
  const ctx = setupTest();

  expect(renderHandoverClosed(ctx.buildClosed('assistant', 90), ctx.times, 'Sam')).toInclude(
    '[#92] You withdrew your ask for Sam to take over the computer.',
  );
});

test('it names the user when the owner has no name, for a withdrawn ask', () => {
  const ctx = setupTest();

  expect(renderHandoverClosed(ctx.buildClosed('assistant', 90), ctx.times, null)).toInclude(
    '[#92] You withdrew your ask for the user to take over the computer.',
  );
});
