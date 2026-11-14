import { expect, test } from 'bun:test';
import { formatPreviousReleaseBuild } from './format-previous-release-build';

test('it names the tag, the total and each phase of a build that ran', () => {
  expect(
    formatPreviousReleaseBuild({
      tag: 'v0.70.2',
      entry: '/cache/out/main.js',
      times: { worktreeMs: 1200, installMs: 1000, buildMs: 900 },
    }),
  ).toBe('the previous release v0.70.2 built in 3.1 s: worktree 1.2 s, install 1.0 s, build 0.9 s');
});

test('it says a cached build ran no phase', () => {
  expect(
    formatPreviousReleaseBuild({ tag: 'v0.70.2', entry: '/cache/out/main.js', times: null }),
  ).toBe('the previous release v0.70.2 was cached, so no phase ran');
});
