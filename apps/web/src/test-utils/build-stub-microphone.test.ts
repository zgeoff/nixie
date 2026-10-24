import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildStubMicrophone } from './build-stub-microphone';

test('it grants the microphone and reports the change when the user allows the prompt', async () => {
  const stub = buildStubMicrophone({ permission: 'prompt', answer: 'allow' });

  const permission = await stub.microphone.queryPermission();

  invariant(permission);

  const changes: PermissionState[] = [];

  permission.addEventListener('change', () => {
    changes.push(permission.state);
  });

  const stream = await stub.microphone.openMedia({ audio: true });

  expect(stream.getTracks()).toHaveLength(1);
  expect(changes).toStrictEqual(['granted']);
  expect(stub.readRequests()).toStrictEqual([{ audio: true }]);
});

test('it ends a track once the track stops', async () => {
  const stub = buildStubMicrophone({ permission: 'granted', answer: 'allow' });

  const stream = await stub.microphone.openMedia({ audio: true });

  for (const track of stream.getTracks()) {
    track.stop();
  }

  expect(stub.readTracks()).toStrictEqual([
    { kind: 'audio', readyState: 'ended', stop: expect.any(Function) },
  ]);
});

test('it refuses with NotAllowedError and blocks the microphone when the user blocks the prompt', async () => {
  const stub = buildStubMicrophone({ permission: 'prompt', answer: 'block' });
  const refusal = stub.microphone.openMedia({ audio: true });

  expect(refusal).rejects.toMatchObject({ name: 'NotAllowedError' });

  const permission = await stub.microphone.queryPermission();

  expect(permission?.state).toBe('denied');
});

test('it refuses with NotAllowedError and keeps the prompt when the user closes the prompt', async () => {
  const stub = buildStubMicrophone({ permission: 'prompt', answer: 'dismiss' });
  const refusal = stub.microphone.openMedia({ audio: true });

  expect(refusal).rejects.toMatchObject({ name: 'NotAllowedError' });

  const permission = await stub.microphone.queryPermission();

  expect(permission?.state).toBe('prompt');
});

test('it refuses with NotFoundError when the device has no microphone', () => {
  const stub = buildStubMicrophone({ permission: 'prompt', answer: 'missing' });

  expect(stub.microphone.openMedia({ audio: true })).rejects.toMatchObject({
    name: 'NotFoundError',
  });
});

test('it refuses at once without a prompt when the microphone is blocked', () => {
  const stub = buildStubMicrophone({ permission: 'denied', answer: 'allow' });

  expect(stub.microphone.openMedia({ audio: true })).rejects.toMatchObject({
    name: 'NotAllowedError',
  });
});

test('it reports a change made in the site settings to every permission it gave out', async () => {
  const stub = buildStubMicrophone({ permission: 'denied', answer: 'allow' });

  const first = await stub.microphone.queryPermission();
  const second = await stub.microphone.queryPermission();

  stub.setPermission('granted');

  expect(first?.state).toBe('granted');
  expect(second?.state).toBe('granted');
});

test('it reads no permission when the browser cannot query it', async () => {
  const stub = buildStubMicrophone({ permission: 'unsupported', answer: 'allow' });

  const permission = await stub.microphone.queryPermission();

  expect(permission).toBeNull();
});

test('it reports media devices by default', () => {
  const stub = buildStubMicrophone({ permission: 'prompt', answer: 'allow' });

  expect(stub.microphone.hasMediaDevices()).toBeTrue();
});

test('it reports no media devices when the options leave them out', () => {
  const stub = buildStubMicrophone({
    permission: 'prompt',
    answer: 'allow',
    hasMediaDevices: false,
  });

  expect(stub.microphone.hasMediaDevices()).toBeFalse();
});
