import './run-github-mock';
import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { createMockGitHubRepo } from './create-mock-github-repo';
import { githubStore } from './github-store';
import { readMockFiles } from './read-mock-files';
import { writeMockBranchFile } from './write-mock-branch-file';

test("it reads the files at a branch's head", async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 2\n',
  });

  expect(readMockFiles('harbour/definitions', 'main')).toStrictEqual({
    'nixie.yaml': 'format: 2\n',
  });
});

test('it reads the files at a commit the branch moved past', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const first = githubStore.refs.findFirst((query) => query.where({ branch: 'main' }));

  invariant(first);

  const older = first.sha;

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 2\n',
  });

  expect(readMockFiles('harbour/definitions', older)).toStrictEqual({});
});

test('it reads null for a revision the repo lacks', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  expect(readMockFiles('harbour/definitions', 'nixie/skill/tide-tables')).toBeNull();
});
