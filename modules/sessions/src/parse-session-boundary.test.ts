import { expect, test } from 'bun:test';
import { parseSessionBoundary } from './parse-session-boundary';

test('it reads a session point from the boundary a commit recorded', () => {
  expect(
    parseSessionBoundary(
      '{"harness":"agent-sdk","sessionID":"7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001","messageID":"7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002"}',
    ),
  ).toStrictEqual({
    harness: 'agent-sdk',
    sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
    messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
  });
});

test('it reads a boundary recorded with no harness as an Agent SDK session point', () => {
  expect(
    parseSessionBoundary(
      '{"sessionID":"7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001","messageID":"7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002"}',
    ),
  ).toStrictEqual({
    harness: 'agent-sdk',
    sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
    messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
  });
});

test.each([
  ['no boundary', null],
  ['a boundary that is not JSON', 'boundary-1'],
  ['a boundary without a message', '{"sessionID":"7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001"}'],
])('it starts a fresh session from %s', (_label, boundary) => {
  expect(parseSessionBoundary(boundary)).toBeNull();
});
