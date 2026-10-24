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
