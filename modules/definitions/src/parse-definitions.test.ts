import { expect, test } from 'bun:test';
import { buildContentHash } from './build-content-hash';
import { parseDefinitions } from './parse-definitions';

test('it reads the format version and the persona, and lists every other file unapplied', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['rules/mail.yaml', new TextEncoder().encode('id: mail\noutcome: deny\n')],
    ['jobs/morning.json', new TextEncoder().encode('{"id":"morning"}')],
    ['notes.md', new TextEncoder().encode('# Notes\n')],
  ]);

  expect(
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toStrictEqual({
    formatVersion: 2,
    persona: '# Persona\n',
    skills: [],
    conversationSkills: [],
    prompts: {},
    unapplied: ['jobs/morning.json', 'notes.md', 'rules/mail.yaml'],
  });
});

test('it refuses definitions without a manifest', () => {
  const files = new Map([['persona.md', new TextEncoder().encode('# Persona\n')]]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toThrowWithMessage(Error, 'nixie.yaml: the definitions have no manifest');
});

test.each([
  ['format 4, which a newer release writes', 'format: 4\n'],
  ['format 1, which two releases back wrote', 'format: 1\n'],
  ['format 0', 'format: 0\n'],
])('it refuses a manifest with %s', (_label, manifest) => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode(manifest)],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toThrowWithMessage(
    Error,
    /^nixie\.yaml: format \d is not one this release reads, which is 2 or 3$/u,
  );
});

test.each([
  ['no format', 'name: mine\n'],
  ['a text format', 'format: one\n'],
  ['a fractional format', 'format: 1.5\n'],
])('it refuses a manifest with %s', (_label, manifest) => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode(manifest)],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toThrowWithMessage(Error, 'nixie.yaml: format must be a whole number');
});

test('it refuses definitions without a persona', () => {
  const files = new Map([['nixie.yaml', new TextEncoder().encode('format: 2\n')]]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toThrowWithMessage(Error, 'persona.md: the definitions have no persona');
});

test('it refuses an empty persona', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
    ['persona.md', new TextEncoder().encode(' \n\n')],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toThrowWithMessage(Error, 'persona.md: the persona is empty');
});

test('it refuses a persona that is not UTF-8 text', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
    ['persona.md', Uint8Array.from([0xff, 0xfe, 0x00])],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toThrowWithMessage(Error, 'persona.md: the file is not UTF-8 text');
});

test('it refuses an unapplied YAML file that fails to parse', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['rules/mail.yaml', new TextEncoder().encode('id: [mail\n')],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toThrowWithMessage(Error, /^rules\/mail\.yaml: YAML Parse error/u);
});

test('it refuses an unapplied JSON file that fails to parse', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['jobs/morning.json', new TextEncoder().encode('{"id":')],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toThrowWithMessage(Error, /^jobs\/morning\.json: JSON Parse error/u);
});

test('it ignores the prompts map under format 2 and lists its part files as unapplied', () => {
  const files = new Map([
    [
      'nixie.yaml',
      new TextEncoder().encode('format: 2\nprompts:\n  writer:\n    safety: prompts/writer.md\n'),
    ],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['prompts/writer.md', new TextEncoder().encode('Quote every fact.\n')],
  ]);

  expect(
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toStrictEqual({
    formatVersion: 2,
    persona: '# Persona\n',
    skills: [],
    conversationSkills: [],
    prompts: {},
    unapplied: ['prompts/writer.md'],
  });
});

test('it refuses a skill file that is not UTF-8 text', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['skills/pdf-forms/form.pdf', Uint8Array.from([0x25, 0x50, 0xff, 0xfe])],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toThrowWithMessage(Error, 'skills/pdf-forms/form.pdf: the file is not UTF-8 text');
});

test('it reads each skill under format 2, and lists none of its files as unapplied', () => {
  const skill = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';
  const script = 'print("high water")\n';

  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['skills/tide-tables/SKILL.md', new TextEncoder().encode(skill)],
    ['skills/tide-tables/scripts/read.py', new TextEncoder().encode(script)],
  ]);

  const folder = new Map([
    ['SKILL.md', new TextEncoder().encode(skill)],
    ['scripts/read.py', new TextEncoder().encode(script)],
  ]);

  expect(
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toStrictEqual({
    formatVersion: 2,
    persona: '# Persona\n',
    skills: [
      {
        name: 'tide-tables',
        skillHash: buildContentHash(folder),
        origin: 'definitions',
        frontmatter: {
          name: 'tide-tables',
          description: 'Reads a tide table.',
          license: null,
          compatibility: null,
          allowedTools: null,
          metadata: {},
        },
        files: new Map([
          ['SKILL.md', skill],
          ['scripts/read.py', script],
        ]),
      },
    ],
    conversationSkills: ['tide-tables'],
    prompts: {},
    unapplied: [],
  });
});

test('it gives the conversation only the skills that the manifest lists', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\nskills: [tide-tables]\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    [
      'skills/tide-tables/SKILL.md',
      new TextEncoder().encode('---\nname: tide-tables\ndescription: Reads a tide table.\n---\n'),
    ],
    [
      'skills/bird-log/SKILL.md',
      new TextEncoder().encode('---\nname: bird-log\ndescription: Logs a bird sighting.\n---\n'),
    ],
  ]);

  const parsed = parseDefinitions({
    contentHash: 'c',
    files,
    revision: 'r',
    repository: null,
    skipped: [],
  });

  expect(parsed.conversationSkills).toStrictEqual(['tide-tables']);
});

test('it gives the conversation each listed skill once, in name order', () => {
  const files = new Map([
    [
      'nixie.yaml',
      new TextEncoder().encode('format: 2\nskills: [tide-tables, bird-log, tide-tables]\n'),
    ],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    [
      'skills/tide-tables/SKILL.md',
      new TextEncoder().encode('---\nname: tide-tables\ndescription: Reads a tide table.\n---\n'),
    ],
    [
      'skills/bird-log/SKILL.md',
      new TextEncoder().encode('---\nname: bird-log\ndescription: Logs a bird sighting.\n---\n'),
    ],
  ]);

  const parsed = parseDefinitions({
    contentHash: 'c',
    files,
    revision: 'r',
    repository: null,
    skipped: [],
  });

  expect(parsed.conversationSkills).toStrictEqual(['bird-log', 'tide-tables']);
});

test('it refuses a manifest skill list that names no skill', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\nskills: [tide-table]\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    [
      'skills/tide-tables/SKILL.md',
      new TextEncoder().encode('---\nname: tide-tables\ndescription: Reads a tide table.\n---\n'),
    ],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toThrowWithMessage(Error, 'nixie.yaml: skills: no skill is named tide-table');
});

test('it refuses a manifest skill list that is not a list of names', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\nskills: tide-tables\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toThrowWithMessage(Error, 'nixie.yaml: skills must be a list of skill names');
});

test('it refuses a skill under format 2 whose SKILL.md fails a seed check', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['skills/tide-tables/SKILL.md', new TextEncoder().encode('# Tides\n')],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toThrowWithMessage(
    Error,
    'skills/tide-tables/SKILL.md: the file does not open with YAML frontmatter between --- lines',
  );
});

test('it reads a part override from its file and a template inline under format 3, and lists only the unread prompt files as unapplied', () => {
  const manifest = [
    'format: 3',
    'prompts:',
    '  writer:',
    '    safety: prompts/writer-safety.md',
    '  compaction:',
    '    _template: |',
    '      {{ parts.instruction }}',
    '',
  ].join('\n');

  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode(manifest)],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['prompts/writer-safety.md', new TextEncoder().encode('Quote {{ owner.name }} exactly.\n')],
    ['prompts/draft.md', new TextEncoder().encode('Not used yet.\n')],
  ]);

  expect(
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toStrictEqual({
    formatVersion: 3,
    persona: '# Persona\n',
    skills: [],
    conversationSkills: [],
    prompts: {
      writer: { parts: { safety: 'Quote {{ owner.name }} exactly.' }, template: null },
      compaction: { parts: {}, template: '{{ parts.instruction }}' },
    },
    unapplied: ['prompts/draft.md'],
  });
});

test('it reads no override under format 3 when the manifest has no prompts map', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 3\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
  ]);

  expect(
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] })
      .prompts,
  ).toStrictEqual({});
});

test.each([
  [
    'an unknown prompt',
    'format: 3\nprompts:\n  greeter:\n    safety: prompts/greeter.md\n',
    [],
    'nixie.yaml: prompts: no prompt is named greeter; the prompts are writer, consolidator, content-checker, retirement-checker, session, compaction',
  ],
  [
    'an unknown part',
    'format: 3\nprompts:\n  writer:\n    tone: prompts/tone.md\n',
    [],
    'nixie.yaml: prompts.writer: the prompt has no part tone; its parts are persona, instruction, safety',
  ],
  [
    'a part that is not a file path',
    'format: 3\nprompts:\n  writer:\n    safety: 5\n',
    [],
    'nixie.yaml: prompts.writer.safety must be the path of a file',
  ],
  [
    'a part file that the definitions do not hold',
    'format: 3\nprompts:\n  writer:\n    safety: prompts/missing.md\n',
    [],
    'nixie.yaml: prompts.writer.safety: the definitions hold no file prompts/missing.md',
  ],
  [
    'a part file that reads a path the prompt does not have',
    'format: 3\nprompts:\n  session:\n    safety: prompts/session.md\n',
    [{ path: 'prompts/session.md', text: 'Answer {{ assistant.name }} kindly.\n' }],
    'prompts/session.md: the safety part of the session prompt reads {{ assistant.name }}, which it does not accept; it accepts persona, skillCatalog, owner.name, parts.skillCatalog, parts.instruction',
  ],
  [
    'a template that reads a path the prompt does not have',
    'format: 3\nprompts:\n  retirement-checker:\n    _template: "{{ parts.safety }} {{ owner.name }}"\n',
    [],
    'nixie.yaml: the template of the retirement-checker prompt reads {{ owner.name }}, which it does not accept; it accepts parts.instruction, parts.safety',
  ],
])('it refuses a prompts map with %s', (_label, manifest, extraFiles, message) => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode(manifest)],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ...extraFiles.map((file): [string, Uint8Array] => [
      file.path,
      new TextEncoder().encode(file.text),
    ]),
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toThrowWithMessage(Error, message);
});

test('it refuses a part file that is not UTF-8 text', () => {
  const files = new Map([
    [
      'nixie.yaml',
      new TextEncoder().encode('format: 3\nprompts:\n  writer:\n    safety: prompts/writer.md\n'),
    ],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['prompts/writer.md', Uint8Array.from([0x51, 0xff, 0xfe])],
  ]);

  expect(() =>
    parseDefinitions({ contentHash: 'c', files, revision: 'r', repository: null, skipped: [] }),
  ).toThrowWithMessage(Error, 'prompts/writer.md: the file is not UTF-8 text');
});
