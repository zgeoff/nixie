import { expect, test } from 'bun:test';
import { pickRollbackResult } from './pick-rollback-result';
import { readReleaseStartOutcome } from './read-release-start-outcome';

test('it passes a start whose database part is ready, though its definitions part is not', () => {
  const readyBody = JSON.stringify({
    status: 'unready',
    parts: {
      database: { isReady: true, reason: null },
      definitions: { isReady: false, reason: 'no seed has applied yet' },
    },
  });

  expect(
    pickRollbackResult(
      'v1.0.0',
      { outcome: 'started', readyStatus: 503, readyBody, output: 'logs' },
      46,
    ),
  ).toStrictEqual({ verdict: 'pass', previous: 'v1.0.0' });
});

test.each([
  [
    'a database part that is unready',
    JSON.stringify({ parts: { database: { isReady: false, reason: 'x' } } }),
  ],
  ['a body with no database part', JSON.stringify({ parts: {} })],
  ['a body that is not JSON', 'oops'],
])('it fails a start with %s, and prints the answer and the output', (_label, readyBody) => {
  expect(
    pickRollbackResult(
      'v1.0.0',
      { outcome: 'started', readyStatus: 503, readyBody, output: 'logs' },
      46,
    ),
  ).toStrictEqual({
    verdict: 'fail',
    previous: 'v1.0.0',
    output: `/health/ready answered 503 ${readyBody}\nlogs`,
  });
});

test('it declares a refusal that names the oldest reader of this build', () => {
  expect(
    pickRollbackResult(
      'v1.0.0',
      {
        outcome: 'refused',
        exit: { code: 1, signal: null },
        output:
          'boot\ndatabase schema 47 needs a build that writes schema 46 or later, and this build writes schema 45: restore a copy\n',
      },
      46,
    ),
  ).toStrictEqual({
    verdict: 'declared',
    previous: 'v1.0.0',
    oldestReader: 46,
    previousWrites: 45,
  });
});

test.each([
  [
    'an oldest reader that this build did not declare',
    'database schema 47 needs a build that writes schema 44 or later, and this build writes schema 45: restore a copy',
  ],
  [
    'a previous release that writes the declared schema',
    'database schema 47 needs a build that writes schema 46 or later, and this build writes schema 46: restore a copy',
  ],
  ['no schema refusal', 'writer lock held by another process'],
])('it fails a refusal with %s', (_label, output) => {
  expect(
    pickRollbackResult(
      'v1.0.0',
      { outcome: 'refused', exit: { code: 1, signal: null }, output },
      46,
    ),
  ).toStrictEqual({ verdict: 'fail', previous: 'v1.0.0', output });
});

test('it fails a release that never listens and never exits, with its output', async () => {
  const outcome = await readReleaseStartOutcome(
    {
      waitForLogEvent: () => new Promise(() => {}),
      exited: new Promise(() => {}),
      readOutput: () => 'still booting',
    },
    { timeoutMs: 50 },
  );

  expect(pickRollbackResult('v1.0.0', outcome, 46)).toStrictEqual({
    verdict: 'fail',
    previous: 'v1.0.0',
    output: 'no listen or exit within 50 ms\nstill booting',
  });
});
