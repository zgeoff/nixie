import './run-github-mock';
import { expect, test } from 'bun:test';
import { createMockGitHubRepo } from './create-mock-github-repo';
import { githubStore } from './github-store';
import { readMockFiles } from './read-mock-files';

test('it creates a repo with its token whose base branch holds one commit of no files', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  expect(githubStore.repos.all()).toMatchObject([
    { repository: 'harbour/definitions', token: 'token-a', isTruncated: false },
  ]);

  expect(githubStore.commits.all()).toMatchObject([{ parents: [] }]);
  expect(readMockFiles('harbour/definitions', 'main')).toStrictEqual({});
});
