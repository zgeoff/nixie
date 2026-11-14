import { expect, test } from 'bun:test';
import { buildPromptProposalHash } from './build-prompt-proposal-hash';

test('it builds the same hex hash from the same proposal', () => {
  const proposal = {
    promptID: 'compaction' as const,
    entry: { safety: 'prompts/compaction-safety.md' },
    files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
  };

  expect(buildPromptProposalHash(proposal)).toStrictEqual(buildPromptProposalHash(proposal));
});

test('it builds a 64-character hex hash', () => {
  expect(
    buildPromptProposalHash({
      promptID: 'compaction',
      entry: { _template: '{{ parts.safety }}' },
      files: [],
    }),
  ).toMatch(/^[0-9a-f]{64}$/u);
});

test('it ignores the order of the entry and of the files', () => {
  expect(
    buildPromptProposalHash({
      promptID: 'compaction',
      entry: { safety: 'prompts/b.md', instruction: 'prompts/a.md' },
      files: [
        { path: 'prompts/b.md', text: 'Answer with the summary alone.\n' },
        { path: 'prompts/a.md', text: 'Keep the open questions.\n' },
      ],
    }),
  ).toBe(
    buildPromptProposalHash({
      promptID: 'compaction',
      entry: { instruction: 'prompts/a.md', safety: 'prompts/b.md' },
      files: [
        { path: 'prompts/a.md', text: 'Keep the open questions.\n' },
        { path: 'prompts/b.md', text: 'Answer with the summary alone.\n' },
      ],
    }),
  );
});

test("it builds another hash when a file's text changes", () => {
  expect(
    buildPromptProposalHash({
      promptID: 'compaction',
      entry: { safety: 'prompts/compaction-safety.md' },
      files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
    }),
  ).not.toBe(
    buildPromptProposalHash({
      promptID: 'compaction',
      entry: { safety: 'prompts/compaction-safety.md' },
      files: [{ path: 'prompts/compaction-safety.md', text: 'Answer in one line.\n' }],
    }),
  );
});

test('it builds another hash for another prompt', () => {
  expect(
    buildPromptProposalHash({
      promptID: 'compaction',
      entry: { _template: '{{ parts.safety }}' },
      files: [],
    }),
  ).not.toBe(
    buildPromptProposalHash({
      promptID: 'writer',
      entry: { _template: '{{ parts.safety }}' },
      files: [],
    }),
  );
});
