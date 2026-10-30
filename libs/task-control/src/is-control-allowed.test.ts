import { expect, test } from 'bun:test';
import { isControlAllowed } from './is-control-allowed';

test.each([
  ['pause', 'ready', false, true],
  ['pause', 'running', false, true],
  ['pause', 'running', true, false],
  ['resume', 'running', true, true],
  ['resume', 'running', false, false],
  ['resume', 'paused', false, true],
  ['stop', 'waiting', false, true],
  ['stop', 'stopped', false, false],
  ['restart', 'failed', false, true],
  ['restart', 'ready', false, false],
  ['interrupt', 'running', false, true],
  ['interrupt', 'waiting', false, false],
  ['close', 'done', false, true],
  ['close', 'closed', false, false],
] as const)(
  'it gives %s of a %s task with a pause request %s as %s',
  (control, state, isPauseRequested, expected) => {
    expect(isControlAllowed(control, { state, isConversation: false, isPauseRequested })).toBe(
      expected,
    );
  },
);

test('it refuses a close of the conversation in any state', () => {
  expect(
    isControlAllowed('close', { state: 'waiting', isConversation: true, isPauseRequested: false }),
  ).toBeFalse();
});

test('it allows a stop of the conversation', () => {
  expect(
    isControlAllowed('stop', { state: 'waiting', isConversation: true, isPauseRequested: false }),
  ).toBeTrue();
});
