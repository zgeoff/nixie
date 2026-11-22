import { expect, test } from 'bun:test';
import { makeSeparateAccount, ownAccount } from './terminal-account';

test('it runs a command as the terminal user inside the terminal cgroup', () => {
  const account = makeSeparateAccount({
    uid: 1002,
    gid: 1002,
    cgroupProcsPath: '/sys/fs/cgroup/nixie-terminal/cgroup.procs',
  });

  expect(account.wrap(['bash', '-c', 'ls'])).toStrictEqual([
    'sh',
    '-c',
    'echo $$ > "$1" && shift && exec "$@"',
    'sh',
    '/sys/fs/cgroup/nixie-terminal/cgroup.procs',
    'setpriv',
    '--reuid=1002',
    '--regid=1002',
    '--clear-groups',
    '--',
    'bash',
    '-c',
    'ls',
  ]);
});

test('it leaves a command of the test build as it is', () => {
  expect(ownAccount.wrap(['bash', '-c', 'ls'])).toStrictEqual(['bash', '-c', 'ls']);
});
