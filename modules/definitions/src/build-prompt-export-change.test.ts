import { expect, test } from 'bun:test';
import { buildPromptExportChange } from './build-prompt-export-change';

test('it builds the same change from the same approval', () => {
  const input = {
    approvalID: 'approval-a',
    proposalID: 'k3x9m2p7qa',
    promptID: 'writer' as const,
    entry: { instruction: 'prompts/writer-instruction.md' },
    files: [{ path: 'prompts/writer-instruction.md', text: 'Write in short sentences.\n' }],
    reason: 'Shorter memories.',
    text: { agentName: null, ownerName: null },
    manifest: 'format: 3\n',
  };

  expect(buildPromptExportChange(input)).toStrictEqual(buildPromptExportChange(input));
});

test('it builds a change with no safety note when the override keeps the built-in safety part', () => {
  const change = buildPromptExportChange({
    approvalID: 'approval-a',
    proposalID: 'k3x9m2p7qa',
    promptID: 'writer',
    entry: { instruction: 'prompts/writer-instruction.md' },
    files: [{ path: 'prompts/writer-instruction.md', text: 'Write in short sentences.\n' }],
    reason: 'Shorter memories.\nOne idea per item.',
    text: { agentName: null, ownerName: null },
    manifest: 'format: 3\n',
  });

  expect(change).toStrictEqual({
    branch: 'nixie/prompt/writer',
    title: 'Override the writer prompt with the version nixie proposed',
    message: 'Override the writer prompt with the version nixie proposed',
    body: 'nixie proposed this override of the `writer` prompt, and the owner approved it: approval `approval-a`, proposal `k3x9m2p7qa`.\n\nThe reason the proposal gives:\n\n> Shorter memories.\n> One idea per item.\n\nThe override applies after this pull request merges and `live` is promoted.\n',
    files: new Map([
      ['prompts/writer-instruction.md', 'Write in short sentences.\n'],
      [
        'nixie.yaml',
        'format: 3\nprompts:\n  writer:\n    instruction: "prompts/writer-instruction.md"\n',
      ],
    ]),
  });
});

test("it moves a part file that another prompt reads to the prompt's own folder, and leaves that prompt's file", () => {
  const change = buildPromptExportChange({
    approvalID: 'approval-a',
    proposalID: 'k3x9m2p7qa',
    promptID: 'compaction',
    entry: { instruction: 'prompts/shared.md' },
    files: [{ path: 'prompts/shared.md', text: 'Keep it to {{ summary.words }} words.\n' }],
    reason: 'Shorter summaries.',
    text: { agentName: null, ownerName: null },
    manifest: 'format: 3\nprompts:\n  writer:\n    instruction: prompts/shared.md\n',
  });

  expect(change.files).toStrictEqual(
    new Map([
      ['prompts/compaction/shared.md', 'Keep it to {{ summary.words }} words.\n'],
      [
        'nixie.yaml',
        'format: 3\nprompts:\n  writer:\n    instruction: prompts/shared.md\n  compaction:\n    instruction: "prompts/compaction/shared.md"\n',
      ],
    ]),
  );

  expect(change.body).toInclude(
    'The proposal names `prompts/shared.md`, which the `writer` prompt reads too, so the change writes the part to `prompts/compaction/shared.md`.',
  );
});

test("it refuses a part file that another prompt reads when that prompt also reads the path in the prompt's own folder", () => {
  expect(() =>
    buildPromptExportChange({
      approvalID: 'approval-a',
      proposalID: 'k3x9m2p7qa',
      promptID: 'compaction',
      entry: { instruction: 'prompts/shared.md' },
      files: [{ path: 'prompts/shared.md', text: 'Keep it short.\n' }],
      reason: 'Shorter summaries.',
      text: { agentName: null, ownerName: null },
      manifest:
        'format: 3\nprompts:\n  writer:\n    instruction: prompts/shared.md\n    safety: prompts/compaction/shared.md\n',
    }),
  ).toThrowWithMessage(
    Error,
    'the compaction override writes prompts/shared.md, which another prompt reads, and the path it would move to, prompts/compaction/shared.md, is read by another prompt too',
  );
});

test('it refuses an override that takes nixie.yaml past the size limit of a definitions file', () => {
  expect(() =>
    buildPromptExportChange({
      approvalID: 'approval-a',
      proposalID: 'k3x9m2p7qa',
      promptID: 'compaction',
      entry: { _template: `{{ parts.safety }}${'a'.repeat(1024 * 1024 - 100)}` },
      files: [],
      reason: 'A longer template.',
      text: { agentName: null, ownerName: null },
      manifest: `format: 3\n# ${'b'.repeat(200)}\n`,
    }),
  ).toThrowWithMessage(
    Error,
    'the compaction override takes nixie.yaml past the 1048576-byte limit of a definitions file',
  );
});

test("it notes a template that never reads the prompt's safety part", () => {
  const change = buildPromptExportChange({
    approvalID: 'approval-a',
    proposalID: 'k3x9m2p7qa',
    promptID: 'compaction',
    entry: { _template: '{{ parts.instruction }}' },
    files: [],
    reason: 'Drop the safety part.',
    text: { agentName: null, ownerName: null },
    manifest: 'format: 3\n',
  });

  expect(change.body).toEndWith(
    "The override's template never reads `{{ parts.safety }}`, so the `compaction` prompt runs without its built-in safety rules.\n",
  );
});
