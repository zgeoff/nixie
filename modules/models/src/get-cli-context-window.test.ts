import { expect, test } from 'bun:test';
import { getCLIContextWindow } from './get-cli-context-window';

test.each([
  ['claude-sonnet-5-5', 1_000_000],
  ['claude-opus-5-5', 1_000_000],
  ['claude-fable-5-1', 1_000_000],
  ['Claude-Sonnet-5-5', 1_000_000],
  ['claude-haiku-5-5[1m]', 1_000_000],
  ['claude-sonnet-4-6[1M]', 1_000_000],
  ['claude-haiku-5-5', 200_000],
  ['claude-sonnet-4-6', 200_000],
  ['glm-5.3', 200_000],
])('it assumes the window of %s is %d tokens', (model, window) => {
  expect(getCLIContextWindow(model)).toBe(window);
});
