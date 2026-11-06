import { expect, test } from 'bun:test';
import { collectSessionHeld } from './collect-session-held.ts';

test('it adds each turn to its session and starts again from the pinned block a turn opened', () => {
  expect(
    collectSessionHeld([
      { sessionNumber: 1, isSessionStart: true, added: 300, pinned: 200 },
      { sessionNumber: 1, isSessionStart: false, added: 50, pinned: 200 },
      { sessionNumber: 2, isSessionStart: true, added: 250, pinned: 200 },
    ]),
  ).toStrictEqual([300, 350, 250]);
});

test('it starts a session that opened on a step with no turn from its pinned block', () => {
  expect(
    collectSessionHeld([
      { sessionNumber: 1, isSessionStart: true, added: 300, pinned: 200 },
      { sessionNumber: 2, isSessionStart: false, added: 40, pinned: 180 },
      { sessionNumber: 2, isSessionStart: false, added: 10, pinned: 180 },
    ]),
  ).toStrictEqual([300, 220, 230]);
});
