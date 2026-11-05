import { expect, test } from 'bun:test';
import { toSDKToolName } from './to-sdk-tool-name';

test.each([
  ['memory.recall', 'mcp__nixie__memory_recall'],
  ['web_fetch', 'mcp__nixie__web_fetch'],
  ['moment.keep-all', 'mcp__nixie__moment_keep-all'],
])('it names %s as the SDK shows it to the model', (name, expected) => {
  expect(toSDKToolName(name)).toBe(expected);
});
