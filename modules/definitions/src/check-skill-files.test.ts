import { expect, test } from 'bun:test';
import { checkSkillFiles } from './check-skill-files';

test('it returns the checked skill for a folder that passes every check', () => {
  expect(
    checkSkillFiles(
      'tide-tables',
      new Map([
        ['SKILL.md', '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n'],
        ['references/ports.md', '# Ports\n'],
      ]),
    ),
  ).toStrictEqual({
    name: 'tide-tables',
    skillHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
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
    checkSkillFiles(
      '../tide-tables',
      new Map([['SKILL.md', '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n']]),
    ),
  ).toStrictEqual([
    {
      path: 'skills/../tide-tables/',
      reason: 'use lowercase letters, digits and single hyphens',
    },
  ]);
});

test.each([
  ['a path that climbs out of the folder', '../bird-log/SKILL.md'],
  ['an absolute path', '/etc/hostname'],
  ['the folder itself', '.'],
])('it refuses %s', (_label, path) => {
  expect(
    checkSkillFiles(
      'tide-tables',
      new Map([
        ['SKILL.md', '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n'],
        [path, 'text\n'],
      ]),
    ),
  ).toStrictEqual([
    { path: `skills/tide-tables/${path}`, reason: "the path is outside the skill's folder" },
  ]);
});

test('it refuses a file past the per-file size limit', () => {
  const ports = 'x'.repeat(65);

  expect(
    checkSkillFiles(
      'tide-tables',
      new Map([
        ['SKILL.md', '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n'],
        ['ports.md', ports],
      ]),
      { maxFileBytes: 64, maxTotalBytes: 1000 },
    ),
  ).toStrictEqual([
    { path: 'skills/tide-tables/ports.md', reason: 'the file is past the 64-byte limit' },
  ]);
});

test('it refuses files past the size limit in all', () => {
  const ports = 'x'.repeat(60);

  expect(
    checkSkillFiles(
      'tide-tables',
      new Map([
        ['SKILL.md', '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n'],
        ['ports.md', ports],
      ]),
      { maxFileBytes: 64, maxTotalBytes: 100 },
    ),
  ).toStrictEqual([
    { path: 'skills/tide-tables/', reason: 'the files are past the 100-byte limit in all' },
  ]);
});

test('it refuses a skill whose text holds a bidirectional control character', () => {
  const override = String.fromCodePoint(0x20_2e);

  expect(
    checkSkillFiles(
      'tide-tables',
      new Map([
        [
          'SKILL.md',
          `---\nname: tide-tables\ndescription: Reads a tide table.\n---\nRead ${override}the table\n`,
        ],
      ]),
    ),
  ).toStrictEqual([
    {
      path: 'skills/tide-tables/SKILL.md',
      reason: 'line 5 holds U+202E, a hidden or bidirectional control character',
    },
  ]);
});

test('it refuses a skill whose frontmatter names another folder', () => {
  expect(
    checkSkillFiles(
      'tide-tables',
      new Map([['SKILL.md', '---\nname: bird-log\ndescription: Logs a bird.\n---\n']]),
    ),
  ).toStrictEqual([
    {
      path: 'skills/tide-tables/SKILL.md',
      reason: 'the name bird-log differs from its folder name tide-tables',
    },
  ]);
});

test('it refuses a skill with no files', () => {
  expect(checkSkillFiles('tide-tables', new Map())).toStrictEqual([
    { path: 'skills/', reason: 'the skill has no files' },
  ]);
});
