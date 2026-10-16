import { expect, test } from 'bun:test';
import { isSessionLive } from './is-session-live';

test.each(['resumable', 'compaction-due'] as const)('it reads a %s session as live', (state) => {
  expect(
    isSessionLive({
      state,
      boundary: {
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
    }),
  ).toBe(true);
});

test.each(['fresh', 'summarized', 'lost'] as const)(
  'it reads a %s session as not live',
  (state) => {
    expect(isSessionLive({ state, boundary: null })).toBe(false);
  },
);

test.each(['forget', 'persona'] as const)(
  'it reads a session that a %s invalidated as not live',
  (cause) => {
    expect(isSessionLive({ state: 'invalidated', boundary: null, cause })).toBe(false);
  },
);
