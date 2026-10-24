import { expect, test } from 'bun:test';
import { checkPromptProposal } from './check-prompt-proposal';
import { DefinitionsParseError } from './definitions-parse-error';
import { parseDefinitions } from './parse-definitions';

test('it passes a proposal whose parts and template the definitions parse accepts', () => {
  expect(
    checkPromptProposal({
      id: 'session',
      entry: {
        instruction: 'prompts/session-instruction.md',
        _template: '{{ persona }}\n\n{{ parts.instruction }}\n\n{{ parts.safety }}',
      },
      files: [
        {
          path: 'prompts/session-instruction.md',
          text: 'Keep replies to {{ owner.name }} short.\n',
        },
      ],
    }),
  ).toStrictEqual([]);
});

test('it passes a proposal that replaces the safety part', () => {
  expect(
    checkPromptProposal({
      id: 'compaction',
      entry: { safety: 'prompts/compaction-safety.md' },
      files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
    }),
  ).toStrictEqual([]);
});

test('it refuses a prompt that nixie does not have', () => {
  expect(
    checkPromptProposal({
      id: 'greeter',
      entry: { safety: 'prompts/greeter.md' },
      files: [{ path: 'prompts/greeter.md', text: 'Say hello.\n' }],
    }),
  ).toStrictEqual([
    {
      path: 'nixie.yaml',
      reason:
        'prompts: no prompt is named greeter; the prompts are writer, consolidator, content-checker, retirement-checker, session, compaction',
    },
  ]);
});

test('it refuses a part that the prompt does not have', () => {
  expect(
    checkPromptProposal({
      id: 'compaction',
      entry: { tone: 'prompts/compaction-tone.md' },
      files: [{ path: 'prompts/compaction-tone.md', text: 'Be warm.\n' }],
    }),
  ).toStrictEqual([
    {
      path: 'nixie.yaml',
      reason: 'prompts.compaction: the prompt has no part tone; its parts are instruction, safety',
    },
  ]);
});

test('it refuses a template that reads a path the prompt does not accept', () => {
  expect(
    checkPromptProposal({
      id: 'compaction',
      entry: { _template: '{{ parts.instruction }}\n{{ owner.birthday }}' },
      files: [],
    }),
  ).toStrictEqual([
    {
      path: 'nixie.yaml',
      reason:
        'the template of the compaction prompt reads {{ owner.birthday }}, which it does not accept; it accepts owner.name, owner.nameAtSentenceStart, summary.words, parts.instruction, parts.safety',
    },
  ]);
});

test('it refuses a part that reads a later part, on the path of its file', () => {
  expect(
    checkPromptProposal({
      id: 'compaction',
      entry: { instruction: 'prompts/compaction-instruction.md' },
      files: [{ path: 'prompts/compaction-instruction.md', text: 'Follow {{ parts.safety }}.\n' }],
    }),
  ).toStrictEqual([
    {
      path: 'prompts/compaction-instruction.md',
      reason:
        'the instruction part of the compaction prompt reads {{ parts.safety }}, which it does not accept; it accepts owner.name, owner.nameAtSentenceStart, summary.words',
    },
  ]);
});

test('it refuses a part whose file the proposal does not hold', () => {
  expect(
    checkPromptProposal({
      id: 'compaction',
      entry: { safety: 'prompts/compaction-safety.md' },
      files: [],
    }),
  ).toStrictEqual([
    {
      path: 'nixie.yaml',
      reason:
        'prompts.compaction.safety: the definitions hold no file prompts/compaction-safety.md',
    },
  ]);
});

test.each([
  ['outside the prompts folder', 'rules/compaction.md'],
  ['the persona', 'persona.md'],
  ['with a step out of the folder', 'prompts/../persona.md'],
  ['with a hidden folder', 'prompts/.drafts/compaction.md'],
  ['with a text extension', 'prompts/compaction.txt'],
])('it refuses a part file %s', (_label, path) => {
  expect(
    checkPromptProposal({
      id: 'compaction',
      entry: { safety: path },
      files: [{ path, text: 'Answer with the summary alone.\n' }],
    }),
  ).toStrictEqual([
    { path, reason: 'a part file sits under prompts/ and ends in .md, .json, .yaml or .yml' },
  ]);
});

test('it refuses a file that no part reads', () => {
  expect(
    checkPromptProposal({
      id: 'compaction',
      entry: { safety: 'prompts/compaction-safety.md' },
      files: [
        { path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' },
        { path: 'prompts/draft.md', text: 'Not used yet.\n' },
      ],
    }),
  ).toStrictEqual([
    { path: 'prompts/draft.md', reason: 'no part of prompts.compaction reads the file' },
  ]);
});

test('it refuses a file that the proposal holds twice', () => {
  expect(
    checkPromptProposal({
      id: 'compaction',
      entry: { safety: 'prompts/compaction-safety.md' },
      files: [
        { path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' },
        { path: 'prompts/compaction-safety.md', text: 'Answer in one line.\n' },
      ],
    }),
  ).toStrictEqual([
    { path: 'prompts/compaction-safety.md', reason: 'the proposal holds the file twice' },
  ]);
});

test('it refuses a part file past the size limit of a definitions file', () => {
  expect(
    checkPromptProposal({
      id: 'compaction',
      entry: { safety: 'prompts/compaction-safety.md' },
      files: [{ path: 'prompts/compaction-safety.md', text: 'a'.repeat(1024 * 1024 + 1) }],
    }),
  ).toStrictEqual([
    { path: 'prompts/compaction-safety.md', reason: 'the file is past the 1048576-byte limit' },
  ]);
});

test('it refuses an entry that overrides nothing', () => {
  expect(checkPromptProposal({ id: 'compaction', entry: {}, files: [] })).toStrictEqual([
    { path: 'nixie.yaml', reason: 'prompts.compaction overrides no part and no template' },
  ]);
});

test('it reports the problems that the definitions parse reports for the same entry and files', () => {
  const manifest = [
    'format: 3',
    'prompts:',
    '  compaction:',
    '    instruction: prompts/compaction-instruction.md',
    '    _template: "{{ parts.instruction }} {{ owner.birthday }}"',
    '',
  ].join('\n');

  const instruction = 'Follow {{ parts.safety }}.\n';

  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode(manifest)],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['prompts/compaction-instruction.md', new TextEncoder().encode(instruction)],
  ]);

  const problems = checkPromptProposal({
    id: 'compaction',
    entry: {
      instruction: 'prompts/compaction-instruction.md',
      _template: '{{ parts.instruction }} {{ owner.birthday }}',
    },
    files: [{ path: 'prompts/compaction-instruction.md', text: instruction }],
  });

  expect(
    Promise.try(() =>
      parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
    ),
  ).rejects.toStrictEqual(new DefinitionsParseError(problems));

  expect(problems.map((problem) => problem.path)).toStrictEqual([
    'prompts/compaction-instruction.md',
    'nixie.yaml',
  ]);
});
