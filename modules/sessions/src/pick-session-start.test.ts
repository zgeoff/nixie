import { expect, test } from 'bun:test';
import { pickSessionStart } from './pick-session-start';

test('it opens a fresh task its first session', () => {
  expect(pickSessionStart({ state: 'fresh', boundary: null })).toStrictEqual({ kind: 'first' });
});

test('it opens a summarized session from its summary', () => {
  expect(pickSessionStart({ state: 'summarized', boundary: null })).toStrictEqual({
    kind: 'compaction',
  });
});

test('it rebuilds an invalidated session for the forget, naming the session it loses', () => {
  expect(
    pickSessionStart({
      state: 'invalidated',
      boundary: {
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
    }),
  ).toStrictEqual({
    kind: 'rebuild',
    reason: 'forget',
    lostSessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
  });
});

test('it rebuilds an invalidated session with no boundary as losing no session', () => {
  expect(pickSessionStart({ state: 'invalidated', boundary: null })).toStrictEqual({
    kind: 'rebuild',
    reason: 'forget',
    lostSessionID: null,
  });
});

test('it rebuilds a lost session, naming the session it loses', () => {
  expect(
    pickSessionStart({
      state: 'lost',
      boundary: {
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
    }),
  ).toStrictEqual({
    kind: 'rebuild',
    reason: 'lost',
    lostSessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
  });
});
