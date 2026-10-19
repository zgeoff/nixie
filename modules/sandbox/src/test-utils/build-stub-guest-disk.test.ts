import { expect, test } from 'bun:test';
import { buildStubGuestDisk } from './build-stub-guest-disk';

const home = { copyPath: '/home/nixie', ownPath: '/home/nixie' };

test('it names the project folder from the path the guest sees, under the path a copy takes', () => {
  const disk = buildStubGuestDisk();

  disk.writeSession({ copyPath: '/', ownPath: '/srv/sandboxes/box-1' }, 'one', []);

  expect([...disk.files.keys()]).toStrictEqual([
    '/.claude/projects/-srv-sandboxes-box-1-conversation/one.jsonl',
  ]);
});

const entry = {
  uuid: '6e697869-0000-8000-8000-000000000001',
  role: 'user',
  text: 'Hi.',
  tokens: 1,
} as const;

test('it reads back the entries of a session it wrote', () => {
  const disk = buildStubGuestDisk();

  disk.writeSession(home, 'one', [entry]);

  expect(disk.readSession(home, 'one')).toStrictEqual([entry]);
});

test('it reads no session from a home that holds none', () => {
  const disk = buildStubGuestDisk();

  expect(disk.readSession(home, 'one')).toBeNull();
});

test('it keeps its transcripts under the CLI project folder of the working directory', () => {
  const disk = buildStubGuestDisk();

  disk.writeSession(home, 'one', [entry]);

  expect([...disk.files.keys()]).toStrictEqual([
    '/home/nixie/.claude/projects/-home-nixie-conversation/one.jsonl',
  ]);
});

test('it removes every session but the kept one, with its staged copies', () => {
  const disk = buildStubGuestDisk();

  disk.writeSession(home, 'one', [entry]);
  disk.writeSession(home, 'two', [entry]);

  disk.files.set(
    '/home/nixie/.claude/projects/-home-nixie-conversation/two.jsonl.copy',
    new Uint8Array(),
  );

  disk.files.set(
    '/home/nixie/.claude/projects/-home-nixie-conversation/one/side.txt',
    new Uint8Array(),
  );

  disk.removeSessionsExcept(home, 'one');

  expect([...disk.files.keys()].toSorted()).toStrictEqual([
    '/home/nixie/.claude/projects/-home-nixie-conversation/one.jsonl',
    '/home/nixie/.claude/projects/-home-nixie-conversation/one/side.txt',
  ]);
});

test('it removes every session when none is kept', () => {
  const disk = buildStubGuestDisk();

  disk.writeSession(home, 'one', [entry]);
  disk.removeSessionsExcept(home, null);

  expect(disk.files.size).toBe(0);
});

test('it removes the config folder and the working directory on a purge, and nothing else', () => {
  const disk = buildStubGuestDisk();

  disk.writeSession(home, 'one', [entry]);
  disk.files.set('/home/nixie/conversation/notes.txt', new Uint8Array());
  disk.files.set('/home/nixie/other.txt', new Uint8Array());
  disk.removeState(home);

  expect([...disk.files.keys()]).toStrictEqual(['/home/nixie/other.txt']);
});

test('it removes only the session files when it loses every session', () => {
  const disk = buildStubGuestDisk();

  disk.writeSession(home, 'one', [entry]);
  disk.files.set('/home/nixie/other.txt', new Uint8Array());
  disk.removeAllSessions();

  expect([...disk.files.keys()]).toStrictEqual(['/home/nixie/other.txt']);
});
