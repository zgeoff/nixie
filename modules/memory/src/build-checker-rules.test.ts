import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import invariant from 'tiny-invariant';
import { buildCheckerRules } from './build-checker-rules';
import { renderMemoryCheckerPrompt } from './render-memory-checker-prompt';
import { retirementCheckerPrompt } from './retirement-checker-prompt';

test('it lists each checker prompt by its ID with the SHA-256 of its text for the owner name', () => {
  expect(buildCheckerRules('Avery')).toStrictEqual([
    {
      id: 'memory.content-checker',
      prompt: `sha256:${createHash('sha256').update(renderMemoryCheckerPrompt('Avery')).digest('hex')}`,
    },
    {
      id: 'memory.retirement-checker',
      prompt: `sha256:${createHash('sha256').update(retirementCheckerPrompt).digest('hex')}`,
    },
  ]);
});

test('it gives the content checker another hash when the owner name changes', () => {
  const named = buildCheckerRules('Avery').find((rule) => rule.id === 'memory.content-checker');
  const unnamed = buildCheckerRules(null).find((rule) => rule.id === 'memory.content-checker');

  invariant(named);
  invariant(unnamed);

  expect(named.prompt).not.toBe(unnamed.prompt);
});
