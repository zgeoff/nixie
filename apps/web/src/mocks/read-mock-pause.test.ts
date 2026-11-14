import { expect, test } from 'bun:test';
import { pauseStore } from './pause-store';
import { readMockPause } from './read-mock-pause';

test('it reads no pause when the store holds none', () => {
  expect(readMockPause()).toBeNull();
});

test('it reads the cause and the time of the pause the store holds', async () => {
  await pauseStore.pauses.create({ cause: 'restore', since: new Date('2026-11-02T08:00:00Z') });

  expect(readMockPause()).toStrictEqual({
    cause: 'restore',
    since: new Date('2026-11-02T08:00:00Z'),
  });
});
