import { expect, test } from 'bun:test';
import { renderSessionMarker } from './render-session-marker';

test('it marks a session rebuilt in place of a lost one', () => {
  expect(
    renderSessionMarker({
      reason: 'missing',
      lost: {
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      },
    }),
  ).toBe('Your context was rebuilt; earlier history is in the event log.');
});

test('it marks a fresh session with no session before it', () => {
  expect(renderSessionMarker(null)).toBe(
    'This is a new session; earlier history is in the event log.',
  );
});
