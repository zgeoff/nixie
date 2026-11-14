import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { createMockGitHubRepo } from './create-mock-github-repo';
import { githubStore } from './github-store';
import { readMockFiles } from './read-mock-files';
import { writeMockBranchFile } from './write-mock-branch-file';

test("it puts a file on a branch as a commit on the branch's head, keeping its other files", async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 2\n',
  });

  const before = githubStore.refs.findFirst((query) => query.where({ branch: 'main' }));

  invariant(before);

  const parent = before.sha;

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'persona.md',
    text: '# Persona\n',
  });

  const after = githubStore.refs.findFirst((query) => query.where({ branch: 'main' }));
  const head = githubStore.commits.findFirst((query) => query.where({ sha: after?.sha ?? '' }));

  expect(readMockFiles('harbour/definitions', 'main')).toStrictEqual({
    'nixie.yaml': 'format: 2\n',
    'persona.md': '# Persona\n',
  });

  expect(head?.parents).toStrictEqual([parent]);
});
