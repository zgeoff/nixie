import { expect, test } from 'bun:test';
import { buildPromptOverrideHash } from './build-prompt-override-hash';

test('it builds no hash for a prompt with no override', () => {
  expect(buildPromptOverrideHash(undefined)).toBeNull();
});

test('it builds the same hex hash from the same override, whatever the order of its parts', () => {
  expect(
    buildPromptOverrideHash({
      parts: { safety: 'Answer with the summary alone.', instruction: 'Keep the open questions.' },
      template: null,
    }),
  ).toBe(
    buildPromptOverrideHash({
      parts: { instruction: 'Keep the open questions.', safety: 'Answer with the summary alone.' },
      template: null,
    }),
  );
});

test('it builds another hash when the text of a part changes under the same template', () => {
  expect(
    buildPromptOverrideHash({
      parts: { safety: 'Answer with the summary alone.' },
      template: '{{ parts.safety }}',
    }),
  ).not.toBe(
    buildPromptOverrideHash({
      parts: { safety: 'Answer in one line.' },
      template: '{{ parts.safety }}',
    }),
  );
});

test('it builds another hash when the template changes', () => {
  expect(buildPromptOverrideHash({ parts: {}, template: '{{ parts.safety }}' })).not.toBe(
    buildPromptOverrideHash({ parts: {}, template: '{{ parts.instruction }}' }),
  );
});
