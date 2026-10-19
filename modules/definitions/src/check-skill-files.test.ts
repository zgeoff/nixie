import { expect, test } from 'bun:test';
import { buildContentHash } from './build-content-hash';
import { checkSkillFiles } from './check-skill-files';

test('it returns the checked skill for a folder that passes every check', () => {
  expect(
    checkSkillFiles('tide-tables', [
      {
        path: 'SKILL.md',
        text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
      },
      { path: 'references/ports.md', text: '# Ports\n' },
    ]),
  ).toStrictEqual({
    name: 'tide-tables',
    skillHash: expect.toSatisfy((hash: string) => /^[0-9a-f]{64}$/u.test(hash)),
    origin: 'definitions',
    frontmatter: {
      name: 'tide-tables',
      description: 'Reads a tide table.',
      license: null,
      compatibility: null,
      metadata: {},
      allowedTools: null,
    },
    files: new Map([
      ['SKILL.md', '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n'],
      ['references/ports.md', '# Ports\n'],
    ]),
  });
});

test('it refuses a name the format does not allow', () => {
  expect(
    checkSkillFiles('../tide-tables', [
      { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
    ]),
  ).toStrictEqual([
    {
      path: 'skills/../tide-tables/',
      reason: 'use lowercase letters, digits and single hyphens',
    },
    {
      path: 'skills/../tide-tables/SKILL.md',
      reason: 'the name tide-tables differs from its folder name ../tide-tables',
    },
  ]);
});

test.each([
  [
    'a path that climbs out of the folder',
    '../bird-log/SKILL.md',
    "the path is outside the skill's folder",
  ],
  ['an absolute path', '/etc/hostname', "the path is outside the skill's folder"],
  ['the folder itself', '.', "the path is outside the skill's folder"],
  ['an empty path', '', "the path is outside the skill's folder"],
  [
    'a path that opens with ./',
    './ports.md',
    'write the path in its plain form, with no ./, // or final /',
  ],
  [
    'a path with //',
    'references//ports.md',
    'write the path in its plain form, with no ./, // or final /',
  ],
  [
    'a path that ends with /',
    'references/',
    'write the path in its plain form, with no ./, // or final /',
  ],
  [
    'a dot folder',
    '.config/settings.json',
    'the definitions source skips a path with a part that starts with a dot',
  ],
  [
    'a dot file',
    'references/.ports.md',
    'the definitions source skips a path with a part that starts with a dot',
  ],
  [
    'a path with a right-to-left override',
    `ports${String.fromCodePoint(0x20_2e)}dm.exe`,
    'the path holds U+202E, a hidden or bidirectional control character',
  ],
])('it refuses %s', (_label, path, reason) => {
  expect(
    checkSkillFiles('tide-tables', [
      { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
      { path, text: 'text\n' },
    ]),
  ).toStrictEqual([{ path: `skills/tide-tables/${path}`, reason }]);
});

test('it refuses a second file at a path an earlier file holds', () => {
  expect(
    checkSkillFiles('tide-tables', [
      { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
      { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide chart.\n---\n' },
    ]),
  ).toStrictEqual([
    {
      path: 'skills/tide-tables/SKILL.md',
      reason: 'the path names a file that an earlier path names',
    },
  ]);
});

test('it refuses a second path that differs from an earlier one only in case', () => {
  expect(
    checkSkillFiles('tide-tables', [
      { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
      { path: 'skill.md', text: '# Tides\n' },
    ]),
  ).toStrictEqual([
    {
      path: 'skills/tide-tables/skill.md',
      reason: 'the path names a file that an earlier path names',
    },
  ]);
});

test('it refuses a file at a path that another path uses as a folder', () => {
  expect(
    checkSkillFiles('tide-tables', [
      { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
      { path: 'references', text: '# Ports\n' },
      { path: 'references/ports.md', text: '# Ports\n' },
    ]),
  ).toStrictEqual([
    {
      path: 'skills/tide-tables/references',
      reason: 'the path names a file that another path uses as a folder',
    },
  ]);
});

test('it refuses a file past the per-file size limit', () => {
  expect(
    checkSkillFiles(
      'tide-tables',
      [
        {
          path: 'SKILL.md',
          text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n',
        },
        { path: 'ports.md', text: 'x'.repeat(65) },
      ],
      { maxFileBytes: 64, maxTotalBytes: 1000 },
    ),
  ).toStrictEqual([
    { path: 'skills/tide-tables/ports.md', reason: 'the file is past the 64-byte limit' },
  ]);
});

test('it refuses files past the size limit in all', () => {
  expect(
    checkSkillFiles(
      'tide-tables',
      [
        {
          path: 'SKILL.md',
          text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n',
        },
        { path: 'ports.md', text: 'x'.repeat(60) },
      ],
      { maxFileBytes: 64, maxTotalBytes: 100 },
    ),
  ).toStrictEqual([
    { path: 'skills/tide-tables/', reason: 'the files are past the 100-byte limit in all' },
  ]);
});

test('it reports a size problem and the seed problems of the same skill together', () => {
  expect(
    checkSkillFiles(
      'tide-tables',
      [
        { path: 'SKILL.md', text: '# Tides\n' },
        { path: 'references/ports.md', text: 'x'.repeat(65) },
      ],
      { maxFileBytes: 64, maxTotalBytes: 1000 },
    ),
  ).toStrictEqual([
    {
      path: 'skills/tide-tables/references/ports.md',
      reason: 'the file is past the 64-byte limit',
    },
    {
      path: 'skills/tide-tables/SKILL.md',
      reason: 'the file does not open with YAML frontmatter between --- lines',
    },
  ]);
});

test('it reports a path problem and the seed problems of the files that pass together', () => {
  expect(
    checkSkillFiles('tide-tables', [
      { path: 'SKILL.md', text: '# Tides\n' },
      { path: '.config/settings.json', text: '{}\n' },
    ]),
  ).toStrictEqual([
    {
      path: 'skills/tide-tables/.config/settings.json',
      reason: 'the definitions source skips a path with a part that starts with a dot',
    },
    {
      path: 'skills/tide-tables/SKILL.md',
      reason: 'the file does not open with YAML frontmatter between --- lines',
    },
  ]);
});

test('it refuses a skill whose text holds a bidirectional control character', () => {
  const override = String.fromCodePoint(0x20_2e);

  expect(
    checkSkillFiles('tide-tables', [
      {
        path: 'SKILL.md',
        text: `---\nname: tide-tables\ndescription: Reads a tide table.\n---\nRead ${override}the table\n`,
      },
    ]),
  ).toStrictEqual([
    {
      path: 'skills/tide-tables/SKILL.md',
      reason: 'line 5 holds U+202E, a hidden or bidirectional control character',
    },
  ]);
});

test('it refuses a skill whose frontmatter names another folder', () => {
  expect(
    checkSkillFiles('tide-tables', [
      { path: 'SKILL.md', text: '---\nname: bird-log\ndescription: Logs a bird.\n---\n' },
    ]),
  ).toStrictEqual([
    {
      path: 'skills/tide-tables/SKILL.md',
      reason: 'the name bird-log differs from its folder name tide-tables',
    },
  ]);
});

test('it refuses a skill with no files', () => {
  expect(checkSkillFiles('tide-tables', [])).toStrictEqual([
    { path: 'skills/tide-tables/', reason: 'the skill has no files' },
  ]);
});

test('it reports the problems of the files beside a name the format does not allow', () => {
  expect(
    checkSkillFiles('../tide-tables', [{ path: 'SKILL.md', text: '# Tides\n' }]),
  ).toStrictEqual([
    {
      path: 'skills/../tide-tables/',
      reason: 'use lowercase letters, digits and single hyphens',
    },
    {
      path: 'skills/../tide-tables/SKILL.md',
      reason: 'the file does not open with YAML frontmatter between --- lines',
    },
  ]);
});

test('it checks and hashes a file with CRLF line endings as the seed reads it, with LF', () => {
  const lf = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  const seeded = new Map([['SKILL.md', new TextEncoder().encode(lf)]]);

  expect(
    checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: lf.replaceAll('\n', '\r\n') }]),
  ).toMatchObject({
    skillHash: buildContentHash(seeded),
    files: new Map([['SKILL.md', lf]]),
  });
});
