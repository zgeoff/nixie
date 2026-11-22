import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderTakeoverStarted } from './render-takeover-started';

function setupTest() {
  return { times: { defaultZone: 'Europe/London', now: new Date('2026-03-03T09:13:00Z') } };
}

test('it tells the assistant that the owner took over and that its calls wait', () => {
  const ctx = setupTest();

  const record = buildMockLogRecord({
    sequence: 88,
    kind: 'computer.takeover_started',
    thread: 'conversation',
    recordedAt: new Date('2026-03-03T09:12:30Z'),
    payload: { shortID: 'k3vq8m2xpa', device: 'session-1' },
  });

  expect(renderTakeoverStarted(record, ctx.times, 'Sam')).toMatch(
    /^<system-message type="computer" id="[\da-f]{12}" at="Tue 3 Mar, 09:12, London">\n\[#88\] Sam took over the computer\. You can read the screen and your tabs; your clicks, typing and commands wait until it comes back\.\n<\/system-message id="[\da-f]{12}">$/u,
  );
});

test('it names the user when the owner has no name', () => {
  const ctx = setupTest();

  const record = buildMockLogRecord({
    kind: 'computer.takeover_started',
    thread: 'conversation',
    payload: { shortID: 'k3vq8m2xpa', device: 'session-1' },
  });

  expect(renderTakeoverStarted(record, ctx.times, null)).toInclude(
    'The user took over the computer.',
  );
});
