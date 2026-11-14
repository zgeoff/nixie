import { expect, test } from 'bun:test';
import { formatReleaseStartOutcome } from './format-release-start-outcome';

test('it names the tag, the status and the body of a start', () => {
  expect(
    formatReleaseStartOutcome('v1.2.3', {
      outcome: 'started',
      readyStatus: 200,
      readyBody: '{"status":"degraded"}',
      output: '',
    }),
  ).toBe('the previous release v1.2.3 started: /health/ready answered 200 {"status":"degraded"}');
});

test('it names the tag, the exit and the output of a refusal', () => {
  expect(
    formatReleaseStartOutcome('v1.2.3', {
      outcome: 'refused',
      exit: { code: 1, signal: null },
      output: 'schema too new\n',
    }),
  ).toBe(
    String.raw`the previous release v1.2.3 refused: exit 1, signal null, output "schema too new\n"`,
  );
});

test('it names the tag, the stage and the output of a timeout', () => {
  expect(
    formatReleaseStartOutcome('v1.2.3', {
      outcome: 'timeout',
      stage: 'listening',
      timeoutMs: 50,
      output: 'booting\n',
    }),
  ).toBe(
    String.raw`the previous release v1.2.3 gave no listen or exit within 50 ms, output "booting\n"`,
  );
});
