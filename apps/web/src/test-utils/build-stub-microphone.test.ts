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

test.each([
  {
    label: 'a blocked prompt',
    permission: 'prompt',
    answer: 'block',
    error: 'NotAllowedError',
    after: 'denied',
  },
  {
    label: 'a closed prompt',
    permission: 'prompt',
    answer: 'dismiss',
    error: 'NotAllowedError',
    after: 'prompt',
  },
  {
    label: 'a device with no microphone',
    permission: 'prompt',
    answer: 'missing',
    error: 'NotFoundError',
    after: 'prompt',
  },
  {
    label: 'a site already blocked',
    permission: 'denied',
    answer: 'allow',
    error: 'NotAllowedError',
    after: 'denied',
  },
] as const)('it refuses $label with $error and leaves the permission $after', async (row) => {
  const stub = buildStubMicrophone({ permission: row.permission, answer: row.answer });
  const refusal = stub.microphone.openMedia({ audio: true });

  expect(refusal).rejects.toMatchObject({ name: row.error });

  const status = await stub.microphone.queryPermission();

  expect(status?.state).toBe(row.after);
  expect(stub.readTracks()).toStrictEqual([]);
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
