import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { buildCheckerRules } from './build-checker-rules';
import { memoryCheckerPrompt } from './memory-checker-prompt';
import { retirementCheckerPrompt } from './retirement-checker-prompt';

test('it lists each checker prompt by its ID with the SHA-256 of its text', () => {
  expect(buildCheckerRules()).toStrictEqual([
    {
      id: 'memory.content-checker',
      prompt: `sha256:${createHash('sha256').update(memoryCheckerPrompt).digest('hex')}`,
    },
    {
      id: 'memory.retirement-checker',
      prompt: `sha256:${createHash('sha256').update(retirementCheckerPrompt).digest('hex')}`,
    },
  ]);
});
