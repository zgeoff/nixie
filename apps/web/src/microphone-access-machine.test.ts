import { expect, test } from 'bun:test';
import { initialTransition, transition } from 'xstate';
import { microphoneAccessMachine } from './microphone-access-machine';

test('it starts by checking the permission', () => {
  const [snapshot] = initialTransition(microphoneAccessMachine);

  expect(snapshot.value).toBe('checking');
});

test.each([
  ['granted', 'on'],
  ['denied', 'blocked'],
  ['prompt', 'not-asked'],
  [null, 'not-asked'],
] as const)('it reads a %p permission as %s', (state, expected) => {
  const [initial] = initialTransition(microphoneAccessMachine);

  const [snapshot] = transition(microphoneAccessMachine, initial, {
    type: 'permission.read',
    state,
  });

  expect(snapshot.value).toBe(expected);
});

test('it stays unavailable when the page has no media devices', () => {
  const [initial] = initialTransition(microphoneAccessMachine);
  const [unavailable] = transition(microphoneAccessMachine, initial, { type: 'unavailable' });
  const [snapshot] = transition(microphoneAccessMachine, unavailable, { type: 'request' });

  expect(snapshot.value).toBe('unavailable');
});

test('it asks once and refuses a second request while the first is open', () => {
  const [initial] = initialTransition(microphoneAccessMachine);

  const [notAsked] = transition(microphoneAccessMachine, initial, {
    type: 'permission.read',
    state: 'prompt',
  });

  const [asking] = transition(microphoneAccessMachine, notAsked, { type: 'request' });

  expect(asking.value).toBe('asking');
  expect(asking.can({ type: 'request' })).toBeFalse();
});

test('it turns on once the request is granted', () => {
  const [initial] = initialTransition(microphoneAccessMachine);

  const [notAsked] = transition(microphoneAccessMachine, initial, {
    type: 'permission.read',
    state: 'prompt',
  });

  const [asking] = transition(microphoneAccessMachine, notAsked, { type: 'request' });
  const [snapshot] = transition(microphoneAccessMachine, asking, { type: 'request.granted' });

  expect(snapshot.value).toBe('on');
  expect(snapshot.can({ type: 'request' })).toBeFalse();
});

test.each([
  ['denied', 'blocked'],
  ['prompt', 'not-asked'],
  [null, 'blocked'],
] as const)('it reads a refusal with a %p permission as %s', (state, expected) => {
  const [initial] = initialTransition(microphoneAccessMachine);

  const [notAsked] = transition(microphoneAccessMachine, initial, {
    type: 'permission.read',
    state: 'prompt',
  });

  const [asking] = transition(microphoneAccessMachine, notAsked, { type: 'request' });

  const [snapshot] = transition(microphoneAccessMachine, asking, {
    type: 'request.refused',
    state,
  });

  expect(snapshot.value).toBe(expected);
});

test('it fails when the microphone does not start, and asks again on a retry', () => {
  const [initial] = initialTransition(microphoneAccessMachine);

  const [notAsked] = transition(microphoneAccessMachine, initial, {
    type: 'permission.read',
    state: 'prompt',
  });

  const [asking] = transition(microphoneAccessMachine, notAsked, { type: 'request' });
  const [failed] = transition(microphoneAccessMachine, asking, { type: 'request.failed' });
  const [snapshot] = transition(microphoneAccessMachine, failed, { type: 'request' });

  expect(failed.value).toBe('failed');
  expect(snapshot.value).toBe('asking');
});

test('it turns on from blocked once the user allows the microphone in the site settings', () => {
  const [initial] = initialTransition(microphoneAccessMachine);

  const [blocked] = transition(microphoneAccessMachine, initial, {
    type: 'permission.read',
    state: 'denied',
  });

  const [snapshot] = transition(microphoneAccessMachine, blocked, {
    type: 'permission.changed',
    state: 'granted',
  });

  expect(snapshot.value).toBe('on');
});

test('it blocks from on once the user blocks the microphone in the site settings', () => {
  const [initial] = initialTransition(microphoneAccessMachine);

  const [on] = transition(microphoneAccessMachine, initial, {
    type: 'permission.read',
    state: 'granted',
  });

  const [snapshot] = transition(microphoneAccessMachine, on, {
    type: 'permission.changed',
    state: 'denied',
  });

  expect(snapshot.value).toBe('blocked');
});
