import { expect, test } from 'bun:test';
import { githubContract } from '../github-contract';
import { findGitHubRoute } from './find-github-route';

test.each([
  [
    'GET',
    '/repos/harbour/definitions/git/ref/heads/nixie/skill/tide-tables',
    {
      name: 'readRef',
      params: { owner: 'harbour', name: 'definitions', branch: 'nixie/skill/tide-tables' },
    },
  ],
  [
    'PATCH',
    '/repos/harbour/definitions/git/refs/heads/main',
    { name: 'updateRef', params: { owner: 'harbour', name: 'definitions', branch: 'main' } },
  ],
  [
    'GET',
    '/repos/harbour/definitions/contents/skills/tide%20tables/SKILL.md',
    {
      name: 'readContent',
      params: { owner: 'harbour', name: 'definitions', path: 'skills/tide tables/SKILL.md' },
    },
  ],
  [
    'POST',
    '/repos/harbour/definitions/pulls',
    { name: 'createPull', params: { owner: 'harbour', name: 'definitions' } },
  ],
  [
    'PATCH',
    '/repos/harbour/definitions/pulls/3',
    { name: 'updatePull', params: { owner: 'harbour', name: 'definitions', number: '3' } },
  ],
] as const)('it routes %s %s', (method, pathname, expected) => {
  expect(findGitHubRoute(githubContract, method, pathname)).toStrictEqual(expected);
});

test.each([
  ['DELETE', '/repos/harbour/definitions/pulls/3'],
  ['GET', '/repos/harbour/definitions/issues'],
  ['GET', '/repos/harbour/definitions/git/trees/abc/extra'],
])('it finds no route for %s %s', (method, pathname) => {
  expect(findGitHubRoute(githubContract, method, pathname)).toBeNull();
});
