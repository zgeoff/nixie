import { expect, test } from 'bun:test';
import { buildPromptSafetyLogFields } from './build-prompt-safety-log-fields';

test('it builds no fields when every prompt keeps its built-in safety part', () => {
  expect(
    buildPromptSafetyLogFields({
      session: { parts: { instruction: 'Keep answers short.' }, template: null },
    }),
  ).toBeNull();
});

test('it names each prompt whose safety part is replaced or left out of its template', () => {
  expect(
    buildPromptSafetyLogFields({
      'retirement-checker': { parts: { safety: 'Give a reason.' }, template: null },
      compaction: { parts: {}, template: '{{ parts.instruction }}' },
    }),
  ).toStrictEqual({ 'retirement-checker': 'replaced', compaction: 'omitted' });
});
