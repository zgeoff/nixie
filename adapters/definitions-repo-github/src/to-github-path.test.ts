import { expect, test } from 'bun:test';
import { toGitHubPath } from './to-github-path';

test.each([
  [
    '/repos/:owner/:name/git/trees/:sha',
    { owner: 'harbour', name: 'definitions', sha: 'abc' },
    '/repos/harbour/definitions/git/trees/abc',
  ],
  [
    '/repos/:owner/:name/git/ref/heads/*branch',
    { owner: 'harbour', name: 'definitions', branch: 'nixie/skill/tide-tables' },
    '/repos/harbour/definitions/git/ref/heads/nixie/skill/tide-tables',
  ],
  [
    '/repos/:owner/:name/contents/*path',
    { owner: 'harbour', name: 'definitions', path: 'skills/tide tables/SKILL.md' },
    '/repos/harbour/definitions/contents/skills/tide%20tables/SKILL.md',
  ],
  [
    '/repos/:owner/:name/git/commits/:sha',
    { owner: 'harbour', name: 'definitions', sha: 'a/b' },
    '/repos/harbour/definitions/git/commits/a%2Fb',
  ],
])('it fills %s', (path, params, expected) => {
  expect(toGitHubPath(path, params)).toBe(expected);
});
