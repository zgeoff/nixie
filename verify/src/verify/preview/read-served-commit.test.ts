import { expect, test } from 'bun:test';
import { WringerError } from '@wringer/core';
import { readServedCommit } from './read-served-commit';

test('#readServedCommit returns the commit the preview checkout holds', async () => {
  const commit = await readServedCommit({
    run: () => Promise.resolve({ exitCode: 0, stdout: '4f2a9c1e\n', stderr: '' }),
  });

  expect(commit).toBe('4f2a9c1e');
});

test('#readServedCommit refuses with an environment error when the checkout has no commit', async () => {
  const read = readServedCommit({
    run: () =>
      Promise.resolve({ exitCode: 128, stdout: '', stderr: 'fatal: not a git repository\n' }),
  });

  await expect(read).rejects.toBeInstanceOf(WringerError);

  await expect(read).rejects.toMatchObject({
    code: 'environment',
    message: "the preview's checkout has no commit: fatal: not a git repository",
  });
});
