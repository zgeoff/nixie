import { expect, test } from 'bun:test';
import { getCLIContextWindow } from './get-cli-context-window';

test.each([
  ['claude-fable-5-2', 1_000_000],
  ['claude-mythos-5-2', 1_000_000],
  ['claude-haiku-5-5', 1_000_000],
  ['claude-fable-5-2-20261101', 1_000_000],
  ['claude-fable-5-2-experimental', 1_000_000],
  ['claude-opus-4.7', 1_000_000],
  ['claude-sonnet-5-5', 1_000_000],
  ['Claude-Opus-5-5', 1_000_000],
  ['anthropic/claude-sonnet-5-5', 1_000_000],
  ['us.anthropic.claude-opus-5-5', 1_000_000],
  ['anthropic.claude-fable-5-1', 1_000_000],
  ['claude-sonnet-5-5-20260301', 1_000_000],
  ['claude-opus-5-5-fast', 1_000_000],
  ['claude-sonnet-5-5-experimental', 1_000_000],
  ['xx.anthropic.claude-sonnet-5-5', 1_000_000],
  ['claude-opus-5-0', 1_000_000],
  ['claude-mythos-preview', 1_000_000],
  ['claude-haiku-5-5[1m]', 1_000_000],
  ['claude-sonnet-4-6[1M]', 1_000_000],
  ['claude-haiku-4-5', 200_000],
  ['claude-fable-5-25', 200_000],
  ['claude-sonnet-5-1', 200_000],
  ['claude-5-5-sonnet', 200_000],
  ['anthropic/claude-mythos-preview', 200_000],
  ['claude-sonnet-4-6', 200_000],
  ['claude-opus-4-6', 200_000],
  ['glm-5.3', 200_000],
])('it assumes the window of %s is %d tokens', (model, window) => {
  expect(getCLIContextWindow(model)).toBe(window);
});
