import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderCallNotice } from './render-call-notice';

function setupTest() {
  return {
    buildContext: (ownerName: string | null) => ({
      at: 'Tue 3 Mar, 09:12, London',
      ownerName,
      mint: () => 'abcdef123456',
      extra: undefined,
    }),
  };
}

test('it tells the conversation that a call started and how to brief it', () => {
  const ctx = setupTest();

  const record = buildMockLogRecord({
    kind: 'call.started',
    thread: 'conversation',
    recordedAt: new Date('2026-03-03T09:12:30Z'),
    payload: { callID: 'c7q2', taskID: 't9k1', startedBy: 'you', carryingSession: 'session-1' },
  });

  expect(renderCallNotice(record, ctx.buildContext('Sam'))).toMatch(
    /^<system-message type="call" id="[\da-f]{12}" at="Tue 3 Mar, 09:12, London">\n\[#c7q2\] Sam started a call\. It runs in its own thread, task t9k1: brief it with task\.message, or end this turn silently\.\n<\/system-message id="[\da-f]{12}">$/u,
  );
});

test('it tells the conversation that nixie rang when nixie started the call', () => {
  const ctx = setupTest();

  const record = buildMockLogRecord({
    kind: 'call.started',
    thread: 'conversation',
    payload: { callID: 'c7q2', taskID: 't9k1', startedBy: 'nixie', carryingSession: 'session-1' },
  });

  expect(renderCallNotice(record, ctx.buildContext(null))).toInclude('[#c7q2] You rang the user.');
});

test('it names the user when an unnamed owner answers', () => {
  const ctx = setupTest();

  const record = buildMockLogRecord({
    kind: 'call.answered',
    thread: 'conversation',
    payload: { callID: 'c7q2', carryingSession: 'session-1' },
  });

  expect(renderCallNotice(record, ctx.buildContext(null))).toInclude(
    '[#c7q2] The user answered the call.',
  );
});

test.each([
  ['you', 'when Sam hung up'],
  ['nixie', 'when you hung up'],
  ['budget', 'because the call budget ran out'],
  ['missed', 'because Sam did not answer'],
  ['declined', 'because Sam declined'],
  ['dropped', 'because the connection dropped'],
] as const)('it says how a call that %s ended', (endedBy, expected) => {
  const ctx = setupTest();

  const record = buildMockLogRecord({
    kind: 'call.ended',
    thread: 'conversation',
    payload: { callID: 'c7q2', endedBy, minutes: 3 },
  });

  expect(renderCallNotice(record, ctx.buildContext('Sam'))).toInclude(
    `[#c7q2] The call ended ${expected}, after 3 min.`,
  );
});
