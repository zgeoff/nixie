import { expect, test } from 'bun:test';
import { encodeHostFrame } from './encode-host-frame';
import { harnessCapabilities } from './harness-ids';
import { buildCapabilitiesWithout } from './test-utils/build-capabilities-without';
import { buildMockMessageFrame } from './test-utils/build-mock-message-frame';
import { buildMockSummarizeFrame } from './test-utils/build-mock-summarize-frame';
import { buildMockTurnFrame } from './test-utils/build-mock-turn-frame';

test('it encodes a frame as its JSON bytes when the harness declares what it needs', () => {
  const frame = { type: 'purge' } as const;

  expect(new TextDecoder().decode(encodeHostFrame(harnessCapabilities.codex, frame))).toBe(
    '{"type":"purge"}',
  );
});

test('it encodes a turn frame for a harness that declares everything', () => {
  const frame = buildMockTurnFrame();
  const bytes = encodeHostFrame(harnessCapabilities['agent-sdk'], frame);

  expect(new TextDecoder().decode(bytes)).toBe(JSON.stringify(frame));
});

test.each([
  ['message', 'live-messages', buildMockMessageFrame()],
  ['interrupt', 'interrupt', { type: 'interrupt' }],
  ['summarize', 'summarize', buildMockSummarizeFrame()],
] as const)('it throws for a %s frame on a harness without %s', (_type, capability, frame) => {
  expect(() => encodeHostFrame(buildCapabilitiesWithout(capability), frame)).toThrow(capability);
});

test('it throws for a turn frame with a resume key on a harness without resume', () => {
  const frame = buildMockTurnFrame({ resume: null });

  expect(() => encodeHostFrame(buildCapabilitiesWithout('resume'), frame)).toThrow('resume');
});

test('it encodes a turn frame with no resume key on a harness without resume', () => {
  const { resume: _resume, ...frame } = buildMockTurnFrame();

  expect(() => encodeHostFrame(buildCapabilitiesWithout('resume'), frame)).not.toThrow();
});

test('it throws for a turn frame with a model call limit on a harness without turn-limit', () => {
  const frame = buildMockTurnFrame({ limits: { modelCalls: 40, toolCallWaitMs: null } });

  expect(() => encodeHostFrame(buildCapabilitiesWithout('turn-limit'), frame)).toThrow(
    'turn-limit',
  );
});

test('it encodes a turn frame with no model call limit on a harness without turn-limit', () => {
  const frame = buildMockTurnFrame({ limits: { modelCalls: null, toolCallWaitMs: null } });

  expect(() => encodeHostFrame(buildCapabilitiesWithout('turn-limit'), frame)).not.toThrow();
});
