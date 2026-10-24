import { expect, onTestFinished, test } from 'bun:test';
import { registerStubMicrophone } from './register-stub-microphone';

test('it grants the microphone and reports the change when the user allows the prompt', async () => {
  const microphone = registerStubMicrophone({ permission: 'prompt', answer: 'allow' });

  const status = await globalThis.navigator.permissions.query({ name: 'microphone' });

  const changes: PermissionState[] = [];

  status.addEventListener('change', () => {
    changes.push(status.state);
  });

  const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });

  expect(stream.getTracks()).toHaveLength(1);
  expect(changes).toStrictEqual(['granted']);
  expect(microphone.readRequests()).toStrictEqual([{ audio: true }]);
});

test('it ends a track once the track stops', async () => {
  const microphone = registerStubMicrophone({ permission: 'granted', answer: 'allow' });

  const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });

  for (const track of stream.getTracks()) {
    track.stop();
  }

  expect(microphone.readTracks()).toStrictEqual([
    { kind: 'audio', readyState: 'ended', stop: expect.any(Function) },
  ]);
});

test('it refuses with NotAllowedError and blocks the microphone when the user blocks the prompt', async () => {
  registerStubMicrophone({ permission: 'prompt', answer: 'block' });

  const refusal = globalThis.navigator.mediaDevices.getUserMedia({ audio: true });

  expect(refusal).rejects.toMatchObject({ name: 'NotAllowedError' });

  const status = await globalThis.navigator.permissions.query({ name: 'microphone' });

  expect(status.state).toBe('denied');
});

test('it refuses with NotAllowedError and keeps the prompt when the user closes the prompt', async () => {
  registerStubMicrophone({ permission: 'prompt', answer: 'dismiss' });

  const refusal = globalThis.navigator.mediaDevices.getUserMedia({ audio: true });

  expect(refusal).rejects.toMatchObject({ name: 'NotAllowedError' });

  const status = await globalThis.navigator.permissions.query({ name: 'microphone' });

  expect(status.state).toBe('prompt');
});

test('it refuses with NotFoundError when the device has no microphone', () => {
  registerStubMicrophone({ permission: 'prompt', answer: 'missing' });

  expect(globalThis.navigator.mediaDevices.getUserMedia({ audio: true })).rejects.toMatchObject({
    name: 'NotFoundError',
  });
});

test('it refuses at once without a prompt when the microphone is blocked', () => {
  registerStubMicrophone({ permission: 'denied', answer: 'allow' });

  expect(globalThis.navigator.mediaDevices.getUserMedia({ audio: true })).rejects.toMatchObject({
    name: 'NotAllowedError',
  });
});

test('it reports a change made in the site settings to every status it gave out', async () => {
  const microphone = registerStubMicrophone({ permission: 'denied', answer: 'allow' });

  const first = await globalThis.navigator.permissions.query({ name: 'microphone' });
  const second = await globalThis.navigator.permissions.query({ name: 'microphone' });

  microphone.setPermission('granted');

  expect(first.state).toBe('granted');
  expect(second.state).toBe('granted');
});

test('it refuses the microphone query with a TypeError when the permission is unsupported', () => {
  registerStubMicrophone({ permission: 'unsupported', answer: 'allow' });

  expect(globalThis.navigator.permissions.query({ name: 'microphone' })).rejects.toBeInstanceOf(
    TypeError,
  );
});

test('it removes both APIs once the test finishes', () => {
  registerStubMicrophone({ permission: 'prompt', answer: 'allow' });

  onTestFinished(() => {
    expect(Object.hasOwn(globalThis.navigator, 'mediaDevices')).toBeFalse();
    expect(Object.hasOwn(globalThis.navigator, 'permissions')).toBeFalse();
  });
});
