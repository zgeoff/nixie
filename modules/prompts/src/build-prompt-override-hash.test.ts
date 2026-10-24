import { expect, test } from 'bun:test';
import { buildPromptOverrideHash } from './build-prompt-override-hash';

test('it builds the SHA-256 of the sorted parts and the template as JSON', () => {
  expect(
    buildPromptOverrideHash({
      parts: { safety: 'Answer with the summary alone.', instruction: 'Keep the open questions.' },
      template: null,
    }),
  ).toBe('13f65d55301567028f74e53c515f3515660eb44760d798cc82930be84fe3d191');
});

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
