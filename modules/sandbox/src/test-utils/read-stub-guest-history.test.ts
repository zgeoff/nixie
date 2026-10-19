import { expect, test } from 'bun:test';
import { buildStubGuestDisk } from './build-stub-guest-disk';
import { readStubGuestHistory } from './read-stub-guest-history';

const home = { copyPath: '/home/nixie', ownPath: '/home/nixie' };

const first = {
  uuid: '6e697869-0000-8000-8000-000000000001',
  role: 'user',
  text: 'a',
  tokens: 1,
} as const;

const second = {
  uuid: '6e697869-0000-8000-8000-000000000002',
  role: 'assistant',
  text: 'b',
  tokens: 1,
} as const;

const third = {
  uuid: '6e697869-0000-8000-8000-000000000003',
  role: 'user',
  text: 'c',
  tokens: 1,
} as const;

test('it reads no history for a fresh session', () => {
  const disk = buildStubGuestDisk();

  expect(readStubGuestHistory({ disk, home }, null)).toStrictEqual({ history: [] });
});

test('it reads the entries up to the resume point', () => {
  const disk = buildStubGuestDisk();

  disk.writeSession(home, 'one', [first, second, third]);

  expect(
    readStubGuestHistory({ disk, home }, { sessionID: 'one', messageID: second.uuid }),
  ).toStrictEqual({ history: [first, second] });
});

test('it fails with session_missing for a session the disk lacks', () => {
  const disk = buildStubGuestDisk();

  expect(
    readStubGuestHistory({ disk, home }, { sessionID: 'one', messageID: first.uuid }),
  ).toStrictEqual({
    failure: {
      type: 'failed',
      reason: 'session_missing',
      detail: 'No conversation found with session ID: one',
    },
  });
});

test('it fails for a point the session lacks', () => {
  const disk = buildStubGuestDisk();

  disk.writeSession(home, 'one', [first]);

  expect(
    readStubGuestHistory({ disk, home }, { sessionID: 'one', messageID: third.uuid }),
  ).toStrictEqual({
    failure: {
      type: 'failed',
      reason: 'error',
      detail: `No message found with message.uuid of: ${third.uuid}`,
    },
  });
});
