import { expect, test } from 'bun:test';
import { collectCLICandidates } from './resolve-installed-cli-path';

test.each([
  [
    'linux on glibc',
    'linux',
    true,
    [
      '@anthropic-ai/claude-agent-sdk-linux-x64/claude',
      '@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude',
    ],
  ],
  [
    'linux on musl',
    'linux',
    false,
    [
      '@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude',
      '@anthropic-ai/claude-agent-sdk-linux-x64/claude',
    ],
  ],
  ['another platform', 'darwin', false, ['@anthropic-ai/claude-agent-sdk-darwin-x64/claude']],
])('it lists the packages to try for %s', (_case, platform, isGlibc, expected) => {
  expect(collectCLICandidates(platform, 'x64', isGlibc)).toStrictEqual(expected);
});
