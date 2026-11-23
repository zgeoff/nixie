import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderHandoverClosed } from './render-handover-closed';

function setupTest() {
  return {
    times: { defaultZone: 'Europe/London', now: new Date('2026-03-03T09:13:00Z') },
    buildClosed: (waitedSeconds: number) =>
      buildMockLogRecord({
        sequence: 92,
        kind: 'computer.handover_closed',
        thread: 'conversation',
        recordedAt: new Date('2026-03-03T09:12:30Z'),
        payload: { shortID: 'k3vq8m2xpa', by: 'expired', waitedSeconds },
      }),
  };
}

test('it tells the assistant that its ask lapsed, and after how long', () => {
  const ctx = setupTest();

  expect(renderHandoverClosed(ctx.buildClosed(3600), ctx.times)).toInclude(
    '[#k3vq8m2xpa] Your handover ask lapsed after 60 min with no take-over.',
  );
});
