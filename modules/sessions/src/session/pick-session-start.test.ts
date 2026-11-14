import { expect, test } from 'bun:test';
import { bindHarness } from '@heynixie/models';
import { buildMockModelProfile } from '@heynixie/models/test-utils';
import { pickSessionStart } from './pick-session-start';

function setupTest() {
  return { session: bindHarness(buildMockModelProfile()).session };
}

test('it opens a fresh task its first session', () => {
  const ctx = setupTest();

  expect(pickSessionStart({ state: 'fresh', boundary: null }, ctx.session)).toStrictEqual({
    kind: 'first',
  });
});

test('it opens a summarized session from its summary', () => {
  const ctx = setupTest();

  expect(pickSessionStart({ state: 'summarized', boundary: null }, ctx.session)).toStrictEqual({
    kind: 'compaction',
  });
});

test('it rebuilds an invalidated session for the forget, naming the session it loses', () => {
  const ctx = setupTest();

  expect(
    pickSessionStart(
      {
        state: 'invalidated',
        boundary: {
          harness: 'agent-sdk',
          sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
          messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
        },
        cause: 'forget',
      },
      ctx.session,
    ),
  ).toStrictEqual({
    kind: 'rebuild',
    reason: 'forget',
    lostSessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
  });
});

test('it rebuilds an invalidated session with no boundary as losing no session', () => {
  const ctx = setupTest();

  expect(
    pickSessionStart({ state: 'invalidated', boundary: null, cause: 'forget' }, ctx.session),
  ).toStrictEqual({
    kind: 'rebuild',
    reason: 'forget',
    lostSessionID: null,
  });
});

test('it rebuilds a session that a persona change invalidated for the persona, naming the session it loses', () => {
  const ctx = setupTest();

  expect(
    pickSessionStart(
      {
        state: 'invalidated',
        boundary: {
          harness: 'agent-sdk',
          sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
          messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
        },
        cause: 'persona',
      },
      ctx.session,
    ),
  ).toStrictEqual({
    kind: 'rebuild',
    reason: 'persona',
    lostSessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
  });
});

test('it rebuilds a lost session, naming the session it loses', () => {
  const ctx = setupTest();

  expect(
    pickSessionStart(
      {
        state: 'lost',
        boundary: {
          harness: 'agent-sdk',
          sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
          messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
        },
      },
      ctx.session,
    ),
  ).toStrictEqual({
    kind: 'rebuild',
    reason: 'lost',
    lostSessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
  });
});

test('it rebuilds an unkept session with no reason and no lost session', () => {
  const ctx = setupTest();

  expect(pickSessionStart({ state: 'unkept', boundary: null }, ctx.session)).toStrictEqual({
    kind: 'rebuild',
    reason: null,
    lostSessionID: null,
  });
});

test('it names no lost session for a stored point when the harness has no session', () => {
  expect(
    pickSessionStart(
      {
        state: 'lost',
        boundary: {
          harness: 'agent-sdk',
          sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
          messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
        },
      },
      null,
    ),
  ).toStrictEqual({ kind: 'rebuild', reason: 'lost', lostSessionID: null });
});
