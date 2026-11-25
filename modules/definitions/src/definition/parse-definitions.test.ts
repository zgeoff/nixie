import { expect, test } from 'bun:test';
import { buildTestTaskSeed } from '../test-utils/build-test-task-seed';
import { buildContentHash } from '../utils/build-content-hash';
import { parseDefinitions } from './parse-definitions';

test('it reads the format version and the persona, and lists every other file unapplied', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['rules/mail.yaml', new TextEncoder().encode('id: mail\noutcome: deny\n')],
    ['tasks/morning/task.yaml', new TextEncoder().encode('name: Morning\nbrief: Plan the day.\n')],
    ['notes.md', new TextEncoder().encode('# Notes\n')],
  ]);

  expect(
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toStrictEqual({
    effects: new Map(),
    formatVersion: 2,
    persona: '# Persona\n',
    skills: [],
    conversationSkills: [],
    prompts: {},
    rules: [],
    budgets: [],
    ruleWarnings: [],
    tasks: [],
    taskWarnings: [],
    voice: null,
    voiceProblems: [],
    unapplied: ['notes.md', 'rules/mail.yaml', 'tasks/morning/task.yaml'],
  });
});

test('it lists a malformed yaml file under tasks/ unapplied and refuses nothing', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 4\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['tasks/unused.yaml', new TextEncoder().encode('value: [')],
    ['tasks/morning/task.yaml', new TextEncoder().encode('name: Morning\nbrief: Plan the day.\n')],
    ['tasks/morning/spare.yaml', new TextEncoder().encode('value: [')],
  ]);

  const parsed = parseDefinitions(
    { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
    buildTestTaskSeed(),
  );

  expect(parsed.unapplied).toStrictEqual(['tasks/morning/spare.yaml', 'tasks/unused.yaml']);
  expect(parsed.tasks.map((task) => task.id)).toStrictEqual(['morning']);
});

test('it refuses definitions without a manifest', () => {
  const files = new Map([['persona.md', new TextEncoder().encode('# Persona\n')]]);

  expect(() =>
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toThrowWithMessage(Error, 'nixie.yaml: the definitions have no manifest');
});

test.each([
  ['format 6, which a newer release writes', 'format: 6\n'],
  ['format 1, which two releases back wrote', 'format: 1\n'],
  ['format 0', 'format: 0\n'],
])('it refuses a manifest with %s', (_label, manifest) => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode(manifest)],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
  ]);

  expect(() =>
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toThrowWithMessage(
    Error,
    /^nixie\.yaml: format \d is not one this release reads, which is 2 or 3 or 4 or 5$/u,
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
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toThrowWithMessage(Error, 'nixie.yaml: format must be a whole number');
});

test('it refuses definitions without a persona', () => {
  const files = new Map([['nixie.yaml', new TextEncoder().encode('format: 2\n')]]);

  expect(() =>
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toThrowWithMessage(Error, 'persona.md: the definitions have no persona');
});

test('it refuses an empty persona', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
    ['persona.md', new TextEncoder().encode(' \n\n')],
  ]);

  expect(() =>
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toThrowWithMessage(Error, 'persona.md: the persona is empty');
});

test('it refuses a persona that is not UTF-8 text', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
    ['persona.md', Uint8Array.from([0xff, 0xfe, 0x00])],
  ]);

  expect(() =>
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toThrowWithMessage(Error, 'persona.md: the file is not UTF-8 text');
});

test('it refuses an unapplied YAML file that fails to parse', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['rules/mail.yaml', new TextEncoder().encode('id: [mail\n')],
  ]);

  expect(() =>
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toThrowWithMessage(Error, /^rules\/mail\.yaml: YAML Parse error/u);
});

test('it refuses an unapplied JSON file that fails to parse', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['rules/morning.json', new TextEncoder().encode('{"id":')],
  ]);

  expect(() =>
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toThrowWithMessage(Error, /^rules\/morning\.json: JSON Parse error/u);
});

test('it ignores the prompts map under format 2 and lists its part files as unapplied', () => {
  const files = new Map([
    [
      'nixie.yaml',
      new TextEncoder().encode(
        'format: 2\nprompts:\n  compaction:\n    safety: prompts/writer.md\n',
      ),
    ],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['prompts/writer.md', new TextEncoder().encode('Quote every fact.\n')],
  ]);

  expect(
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toStrictEqual({
    effects: new Map(),
    formatVersion: 2,
    persona: '# Persona\n',
    skills: [],
    conversationSkills: [],
    prompts: {},
    rules: [],
    budgets: [],
    ruleWarnings: [],
    tasks: [],
    taskWarnings: [],
    voice: null,
    voiceProblems: [],
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
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
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
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toStrictEqual({
    effects: new Map(),
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
    rules: [],
    budgets: [],
    ruleWarnings: [],
    tasks: [],
    taskWarnings: [],
    voice: null,
    voiceProblems: [],
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

  const parsed = parseDefinitions(
    {
      contentHash: 'c',
      files,
      revision: 'r',
      repository: null,
      skipped: [],
    },
    buildTestTaskSeed(),
  );

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

  const parsed = parseDefinitions(
    {
      contentHash: 'c',
      files,
      revision: 'r',
      repository: null,
      skipped: [],
    },
    buildTestTaskSeed(),
  );

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
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toThrowWithMessage(Error, 'nixie.yaml: skills: no skill is named tide-table');
});

test('it refuses a manifest skill list that is not a list of names', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\nskills: tide-tables\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
  ]);

  expect(() =>
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toThrowWithMessage(Error, 'nixie.yaml: skills must be a list of skill names');
});

test('it refuses a skill under format 2 whose SKILL.md fails a seed check', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['skills/tide-tables/SKILL.md', new TextEncoder().encode('# Tides\n')],
  ]);

  expect(() =>
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toThrowWithMessage(
    Error,
    'skills/tide-tables/SKILL.md: the file does not open with YAML frontmatter between --- lines',
  );
});

test('it reads a part override from its file and a template inline under format 3, and lists only the unread prompt files as unapplied', () => {
  const manifest = [
    'format: 3',
    'prompts:',
    '  task:',
    '    safety: prompts/compaction-safety.md',
    '  compaction:',
    '    _template: |',
    '      {{ parts.instruction }}',
    '',
  ].join('\n');

  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode(manifest)],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['prompts/compaction-safety.md', new TextEncoder().encode('Quote {{ owner.name }} exactly.\n')],
    ['prompts/draft.md', new TextEncoder().encode('Not used yet.\n')],
  ]);

  expect(
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toStrictEqual({
    effects: new Map(),
    formatVersion: 3,
    persona: '# Persona\n',
    skills: [],
    conversationSkills: [],
    prompts: {
      task: { parts: { safety: 'Quote {{ owner.name }} exactly.' }, template: null },
      compaction: { parts: {}, template: '{{ parts.instruction }}' },
    },
    rules: [],
    budgets: [],
    ruleWarnings: [],
    tasks: [],
    taskWarnings: [],
    voice: null,
    voiceProblems: [],
    unapplied: ['prompts/draft.md'],
  });
});

test('it drops the final Windows line breaks of a part file', () => {
  const files = new Map([
    [
      'nixie.yaml',
      new TextEncoder().encode(
        'format: 3\nprompts:\n  compaction:\n    safety: prompts/writer.md\n',
      ),
    ],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['prompts/writer.md', new TextEncoder().encode('Quote every fact.\r\nKeep it short.\r\n\r\n')],
  ]);

  expect(
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ).prompts,
  ).toStrictEqual({
    compaction: { parts: { safety: 'Quote every fact.\r\nKeep it short.' }, template: null },
  });
});

test('it reads no override under format 3 when the manifest has no prompts map', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 3\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
  ]);

  expect(
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ).prompts,
  ).toStrictEqual({});
});

test.each([
  [
    'an unknown prompt',
    'format: 3\nprompts:\n  greeter:\n    safety: prompts/greeter.md\n',
    [],
    'nixie.yaml: prompts: no prompt is named greeter; the prompts are content-checker, retirement-checker, session, compaction, task',
  ],
  [
    'an unknown part',
    'format: 3\nprompts:\n  compaction:\n    tone: prompts/tone.md\n',
    [],
    'nixie.yaml: prompts.compaction: the prompt has no part tone; its parts are instruction, safety',
  ],
  [
    'a part that is not a file path',
    'format: 3\nprompts:\n  compaction:\n    safety: 5\n',
    [],
    'nixie.yaml: prompts.compaction.safety must be the path of a file',
  ],
  [
    'a part file that the definitions do not hold',
    'format: 3\nprompts:\n  compaction:\n    safety: prompts/missing.md\n',
    [],
    'nixie.yaml: prompts.compaction.safety: the definitions hold no file prompts/missing.md',
  ],
  [
    'a part file that reads a path the prompt does not have',
    'format: 3\nprompts:\n  session:\n    safety: prompts/session.md\n',
    [{ path: 'prompts/session.md', text: 'Answer {{ assistant.name }} kindly.\n' }],
    'prompts/session.md: the safety part of the session prompt reads {{ assistant.name }}, which it does not accept; it accepts persona, skillCatalog, owner.name, parts.skillCatalog, parts.output',
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
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toThrowWithMessage(Error, message);
});

test('it refuses a part file that is not UTF-8 text', () => {
  const files = new Map([
    [
      'nixie.yaml',
      new TextEncoder().encode(
        'format: 3\nprompts:\n  compaction:\n    safety: prompts/writer.md\n',
      ),
    ],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['prompts/writer.md', Uint8Array.from([0x51, 0xff, 0xfe])],
  ]);

  expect(() =>
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toThrowWithMessage(Error, 'prompts/writer.md: the file is not UTF-8 text');
});

test('it parses the budgets of a format 5 repo with their hashes, and the lift that names one', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 5\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    [
      'budgets/shopping.yaml',
      new TextEncoder().encode('shopping-month:\n  counts: spend\n  limit: 100\n  period: month\n'),
    ],
    [
      'rules/shop.yaml',
      new TextEncoder().encode(
        'allow-groceries:\n  outcome: allow\n  tools: [shop.order]\n  lift: { perAction: 20, budget: shopping-month }\n',
      ),
    ],
  ]);

  const parsed = parseDefinitions(
    { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
    buildTestTaskSeed(),
  );

  expect(parsed.budgets).toStrictEqual([
    {
      id: 'shopping-month',
      counts: 'spend',
      limitMicros: 100_000_000,
      period: 'month',
      hash: expect.stringMatching(/^[0-9a-f]{64}$/u),
    },
  ]);

  expect(parsed.rules).toMatchObject([
    { rule: { lift: { perAction: 20, budget: 'shopping-month' } } },
  ]);

  expect(parsed.unapplied).toStrictEqual([]);
});

test('it leaves budget files unapplied in a format 4 repo', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 4\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    [
      'budgets/shopping.yaml',
      new TextEncoder().encode('shopping-month:\n  counts: spend\n  limit: 100\n  period: month\n'),
    ],
  ]);

  const parsed = parseDefinitions(
    { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
    buildTestTaskSeed(),
  );

  expect(parsed.budgets).toStrictEqual([]);
  expect(parsed.unapplied).toStrictEqual(['budgets/shopping.yaml']);
});

test('it refuses a budget ID that 2 files define, with both file names', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 5\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    [
      'budgets/a.yaml',
      new TextEncoder().encode('shopping-month:\n  counts: spend\n  limit: 100\n  period: month\n'),
    ],
    [
      'budgets/b.yaml',
      new TextEncoder().encode('shopping-month:\n  counts: spend\n  limit: 50\n  period: month\n'),
    ],
  ]);

  expect(() =>
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toThrowWithMessage(
    Error,
    'budgets/b.yaml: the budget ID shopping-month is also in budgets/a.yaml, and an ID names one budget',
  );
});

test.each([
  [
    'a lift of a budget the definitions lack',
    'allow-x:\n  outcome: allow\n  lift: { perAction: 20, budget: pet-month }\n',
    'rules/x.yaml: allow-x.lift.budget: the definitions have no budget pet-month',
  ],
  [
    'a lift of a budget that counts a tool',
    'allow-x:\n  outcome: allow\n  lift: { perAction: 20, budget: search-day }\n',
    'rules/x.yaml: allow-x.lift.budget: the budget search-day counts tool:search, and a lift needs a budget that counts spend',
  ],
  [
    'a lift with no budget',
    'allow-x:\n  outcome: allow\n  lift: { perAction: 20 }\n',
    'rules/x.yaml: allow-x.lift.budget: Invalid input: expected string, received undefined',
  ],
])('it refuses %s', (_label, rule, message) => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 5\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    [
      'budgets/tools.yaml',
      new TextEncoder().encode('search-day:\n  counts: tool:search\n  limit: 5\n  period: day\n'),
    ],
    ['rules/x.yaml', new TextEncoder().encode(rule)],
  ]);

  expect(() =>
    parseDefinitions(
      { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
      buildTestTaskSeed(),
    ),
  ).toThrowWithMessage(Error, message);
});

test('it reads the voice settings of voice/voice.yaml and voice/lines.yaml from format 5', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 5\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    [
      'voice/voice.yaml',
      new TextEncoder().encode('voice: cedar\nhold_after_ms: 2000\nprice_per_minute: 0.05\n'),
    ],
    ['voice/lines.yaml', new TextEncoder().encode('holding: Hang on.\n')],
    ['voice/prompt.md', new TextEncoder().encode('Speak plainly.\n')],
  ]);

  const parsed = parseDefinitions(
    { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
    buildTestTaskSeed(),
  );

  expect([parsed.voice?.voice, parsed.voice?.pricePerMinuteMicros, parsed.unapplied]).toStrictEqual(
    ['cedar', 50_000, ['voice/prompt.md']],
  );
});

test('it reports a voice file with a fault, applies none of it and never refuses the seed', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 5\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['voice/voice.yaml', new TextEncoder().encode('price_per_minute: [unclosed\n')],
    ['voice/other.yaml', new TextEncoder().encode('key: [unclosed\n')],
  ]);

  const parsed = parseDefinitions(
    { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
    buildTestTaskSeed(),
  );

  expect([parsed.voice, parsed.voiceProblems, parsed.unapplied]).toStrictEqual([
    null,
    [{ path: 'voice/voice.yaml', reason: expect.any(String) }],
    ['voice/other.yaml', 'voice/voice.yaml'],
  ]);
});

test('it leaves the voice files of a format before 5 unapplied', () => {
  const files = new Map([
    ['nixie.yaml', new TextEncoder().encode('format: 4\n')],
    ['persona.md', new TextEncoder().encode('# Persona\n')],
    ['voice/voice.yaml', new TextEncoder().encode('price_per_minute: 0.05\n')],
  ]);

  const parsed = parseDefinitions(
    { contentHash: 'c', files, revision: 'r', repository: null, skipped: [] },
    buildTestTaskSeed(),
  );

  expect([parsed.voice, parsed.unapplied]).toStrictEqual([null, ['voice/voice.yaml']]);
});
