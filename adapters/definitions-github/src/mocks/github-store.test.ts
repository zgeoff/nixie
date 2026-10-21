import { expect, test } from 'bun:test';
import { githubStore } from './github-store';

test('it clears every collection on a reset', async () => {
  await githubStore.repos.create({ repository: 'harbour/definitions', token: 'token-a' });
  await githubStore.trees.create({ files: { 'nixie.yaml': 'format: 2\n' } });
  await githubStore.commits.create({ parents: [] });
  await githubStore.refs.create({ repository: 'harbour/definitions', branch: 'main' });
  await githubStore.pulls.create({ repository: 'harbour/definitions', number: 1 });

  githubStore.reset();

  expect([
    githubStore.repos.count(),
    githubStore.trees.count(),
    githubStore.commits.count(),
    githubStore.refs.count(),
    githubStore.pulls.count(),
  ]).toStrictEqual([0, 0, 0, 0, 0]);
});
