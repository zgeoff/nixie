import { expect, test } from 'bun:test';
import { readGitCheckout } from './read-git-checkout';

test('it reads the commit and the origin through the reader it is given', async () => {
  const files = new Map([
    ['/srv/sync/.worktrees/current/.git', 'gitdir: ../../.git/worktrees/current\n'],
    ['/srv/sync/.git/worktrees/current/HEAD', '6e1a9c4f2b8d0e7a3c5f9b1d4e6a8c2f0b3d5e79\n'],
    ['/srv/sync/.git/worktrees/current/commondir', '../..\n'],
    ['/srv/sync/.git/config', '[remote "origin"]\n\turl = https://git.example.test/plover/terns\n'],
  ]);

  const checkout = await readGitCheckout('/srv/sync/.worktrees/current', (path) =>
    Promise.resolve(files.get(path) ?? ''),
  );

  expect(checkout).toStrictEqual({
    commit: '6e1a9c4f2b8d0e7a3c5f9b1d4e6a8c2f0b3d5e79',
    repository: 'https://git.example.test/plover/terns',
  });
});

test('it reads no checkout when the directory holds no git file', async () => {
  const checkout = await readGitCheckout('/srv/definitions', () =>
    Promise.reject(Object.assign(new Error('no such file'), { code: 'ENOENT' })),
  );

  expect(checkout).toBeNull();
});

test('it fails on a git file that it cannot read for a reason other than a missing file', () => {
  const checkout = readGitCheckout('/srv/definitions', () =>
    Promise.reject(Object.assign(new Error('permission denied'), { code: 'EACCES' })),
  );

  expect(checkout).rejects.toMatchObject({ code: 'EACCES' });
});
