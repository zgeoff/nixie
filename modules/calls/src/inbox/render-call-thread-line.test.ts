import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderCallThreadLine } from './render-call-thread-line';

interface TestExtra {
  cut: { heard: string; unheard: string } | null;
  smallTalk: string[];
}

function setupTest() {
  return {
    buildContext: (extra: TestExtra) => ({
      at: 'Tue 3 Mar, 09:12, London',
      ownerName: 'Sam',
      mint: () => 'abcdef123456',
      extra,
    }),
    buildHandOff: (request: string) =>
      buildMockLogRecord({
        kind: 'call.handed_off',
        thread: 'call-task',
        recordedAt: new Date('2026-03-03T09:12:30Z'),
        payload: { callID: 'c7q2', handOffID: 'h1', shortID: 'k3vq8m2xpa' },
        erasable: { status: 'readable', fields: { request } },
      }),
  };
}

test('it shows the request that the speech layer handed off, as a quoted string', () => {
  const ctx = setupTest();

  const text = renderCallThreadLine(
    ctx.buildHandOff('what is on "today"'),
    ctx.buildContext({ cut: null, smallTalk: [] }),
  );

  expect(text).toInclude(
    String.raw`[#k3vq8m2xpa] The speech layer handed you this request: "what is on \"today\""`,
  );
});

test('it shows the small talk that came before the hand-off, in order, ahead of the request', () => {
  const ctx = setupTest();

  const text = renderCallThreadLine(
    ctx.buildHandOff('what is on today'),
    ctx.buildContext({ cut: null, smallTalk: ['Morning!', 'One sec.'] }),
  );

  expect(text.indexOf('"Morning!"')).toBeLessThan(text.indexOf('"One sec."'));
  expect(text.indexOf('"One sec."')).toBeLessThan(text.indexOf('handed you this request'));
});

test('it shows a request that a forget erased as forgotten', () => {
  const ctx = setupTest();

  const record = buildMockLogRecord({
    kind: 'call.handed_off',
    thread: 'call-task',
    payload: { callID: 'c7q2', handOffID: 'h1', shortID: 'k3vq8m2xpa' },
    erasable: { status: 'shredded' },
  });

  expect(renderCallThreadLine(record, ctx.buildContext({ cut: null, smallTalk: [] }))).toInclude(
    '[since forgotten]',
  );
});

test('it shows the part of a reply that the user heard and the part they did not', () => {
  const ctx = setupTest();

  const record = buildMockLogRecord({
    kind: 'call.heard_cut',
    thread: 'call-task',
    payload: { callID: 'c7q2', handOffID: 'h1', replyRecordID: '12', heardChars: 9 },
  });

  const text = renderCallThreadLine(
    record,
    ctx.buildContext({ cut: { heard: 'You have ', unheard: 'two things today.' }, smallTalk: [] }),
  );

  expect(text).toInclude(
    '[reply #12] The user talked over your reply. They heard: "You have " They did not hear: "two things today."',
  );
});

test('it says a cut reply is forgotten when its text is gone', () => {
  const ctx = setupTest();

  const record = buildMockLogRecord({
    kind: 'call.heard_cut',
    thread: 'call-task',
    payload: { callID: 'c7q2', handOffID: 'h1', replyRecordID: '12', heardChars: 9 },
  });

  expect(renderCallThreadLine(record, ctx.buildContext({ cut: null, smallTalk: [] }))).toInclude(
    'that reply is since forgotten',
  );
});

test('it asks for a summary that is not spoken when the call ends', () => {
  const ctx = setupTest();

  const record = buildMockLogRecord({
    kind: 'call.closing',
    thread: 'call-task',
    payload: { callID: 'c7q2' },
  });

  expect(renderCallThreadLine(record, ctx.buildContext({ cut: null, smallTalk: [] }))).toInclude(
    'Reply with a summary of it for the conversation',
  );
});
