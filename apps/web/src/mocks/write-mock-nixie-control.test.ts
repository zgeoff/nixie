import { expect, test } from 'bun:test';
import { pauseStore } from './pause-store';
import { readMockPause } from './read-mock-pause';
import { writeMockNixieControl } from './write-mock-nixie-control';

test('it pauses nixie for the owner', async () => {
  const result = await writeMockNixieControl('pause', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
  });

  expect(result).toStrictEqual({
    status: 'controlled',
    paused: { cause: 'owner', since: expect.toBeValidDate() },
  });
});

test('it resumes nixie, and drops the exemptions', async () => {
  await writeMockNixieControl('pause', { clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e' });

  await pauseStore.pauseExemptions.create({ taskID: 'k3x9m2p7qa' });

  const result = await writeMockNixieControl('resume', {
    clientActionID: '7e9a1c3b-5d2f-4a8e-9c6b-0f1d3e5a7c92',
  });

  expect(result).toStrictEqual({ status: 'controlled', paused: null });
  expect(readMockPause()).toBeNull();
  expect(pauseStore.pauseExemptions.all()).toStrictEqual([]);
});

test('it replays the first result of a repeated pause after nixie resumed', async () => {
  const first = await writeMockNixieControl('pause', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
  });

  await writeMockNixieControl('resume', { clientActionID: '7e9a1c3b-5d2f-4a8e-9c6b-0f1d3e5a7c92' });

  const repeat = await writeMockNixieControl('pause', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
  });

  expect(repeat).toStrictEqual(first);
});

test('it refuses a client action ID that the other control used', async () => {
  await writeMockNixieControl('pause', { clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e' });

  const result = await writeMockNixieControl('resume', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
  });

  expect(result).toStrictEqual({ status: 'reused' });
});
