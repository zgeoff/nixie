import { expect, test } from 'bun:test';
import { buildPromptManifest } from './build-prompt-manifest';

test('it adds a prompts map with the entry, and sets format 3, keeping every other line', () => {
  const manifest = [
    '# the deployment of a test garden',
    'format: 2 # bumped by hand',
    'skills:',
    '  - tide-tables',
    '',
  ].join('\n');

  const built = buildPromptManifest(manifest, 'compaction', {
    safety: 'prompts/compaction-safety.md',
  });

  expect(built.previousFormat).toBe(2);

  expect(built.text).toMatchInlineSnapshot(`
    "# the deployment of a test garden
    format: 3 # bumped by hand
    skills:
      - tide-tables
    prompts:
      compaction:
        safety: "prompts/compaction-safety.md"
    "
  `);
});

test('it builds the same manifest from the same input', () => {
  const manifest = 'format: 3\nprompts:\n  writer:\n    safety: prompts/writer.md\n';

  expect(
    buildPromptManifest(manifest, 'compaction', { _template: '{{ parts.safety }}' }),
  ).toStrictEqual(buildPromptManifest(manifest, 'compaction', { _template: '{{ parts.safety }}' }));
});

test("it adds the entry beside another prompt's entry and keeps its comments", () => {
  const manifest = [
    'format: 3',
    'prompts:',
    '    # the writer quotes every fact',
    '    writer:',
    '        safety: prompts/writer.md',
    'skills: []',
    '',
  ].join('\n');

  expect(
    buildPromptManifest(manifest, 'compaction', { safety: 'prompts/compaction-safety.md' }).text,
  ).toMatchInlineSnapshot(`
    "format: 3
    prompts:
        # the writer quotes every fact
        writer:
            safety: prompts/writer.md
        compaction:
          safety: "prompts/compaction-safety.md"
    skills: []
    "
  `);
});

test('it replaces the entry of the same prompt and leaves the entries around it', () => {
  const manifest = [
    'format: 3',
    'prompts:',
    '  writer:',
    '    safety: prompts/writer.md',
    '  compaction:',
    '    instruction: prompts/compaction-old.md',
    '    _template: "{{ parts.instruction }}"',
    '  session:',
    '    safety: prompts/session.md',
    '',
  ].join('\n');

  expect(
    buildPromptManifest(manifest, 'compaction', { safety: 'prompts/compaction-safety.md' }).text,
  ).toMatchInlineSnapshot(`
    "format: 3
    prompts:
      writer:
        safety: prompts/writer.md
      compaction:
        safety: "prompts/compaction-safety.md"
      session:
        safety: prompts/session.md
    "
  `);
});

test('it writes a template of several lines as a literal block', () => {
  expect(
    buildPromptManifest('format: 3\n', 'session', {
      _template: '{{ persona }}\n\n{{ parts.instruction }}\n\n{{ parts.safety }}',
    }).text,
  ).toMatchInlineSnapshot(`
    "format: 3
    prompts:
      session:
        _template: |-
          {{ persona }}

          {{ parts.instruction }}

          {{ parts.safety }}
    "
  `);
});

test('it quotes a template that ends in a line break', () => {
  expect(
    buildPromptManifest('format: 3\n', 'session', { _template: '{{ parts.safety }}\n' }).text,
  ).toBe('format: 3\nprompts:\n  session:\n    _template: "{{ parts.safety }}\\n"\n');
});

test('it keeps the format of a manifest at format 3', () => {
  expect(
    buildPromptManifest('format: 3\n', 'compaction', { _template: '{{ parts.safety }}' })
      .previousFormat,
  ).toBe(3);
});

test('it refuses a prompts map written in flow style', () => {
  expect(() =>
    buildPromptManifest(
      'format: 3\nprompts: { writer: { safety: prompts/writer.md } }\n',
      'compaction',
      { _template: '{{ parts.safety }}' },
    ),
  ).toThrowWithMessage(
    Error,
    'nixie.yaml on the base branch has a layout the export cannot edit for the compaction prompt',
  );
});

test('it refuses a manifest with no format line', () => {
  expect(() =>
    buildPromptManifest('skills: []\n', 'compaction', { _template: '{{ parts.safety }}' }),
  ).toThrowWithMessage(
    Error,
    'nixie.yaml on the base branch has no format line the export can read',
  );
});
