import { expect, test } from 'bun:test';
import { buildContentHash } from './build-content-hash';
import { parseSkills } from './parse-skills';

test('it reads a vendored skill whose files match its lock entry as vendored', () => {
  const skill = '---\nname: pdf-forms\ndescription: Fills PDF forms.\n---\n# Forms\n';
  const contentHash = buildContentHash(new Map([['SKILL.md', new TextEncoder().encode(skill)]]));

  const lock = JSON.stringify({
    'pdf-forms': {
      source: 'https://github.com/example/skills',
      path: 'skills/pdf-forms',
      commit: 'a'.repeat(40),
      contentHash,
    },
  });

  const texts = new Map([
    ['skills/skills.lock.json', lock],
    ['skills/pdf-forms/SKILL.md', skill],
  ]);

  const files = new Map([...texts].map(([path, text]) => [path, new TextEncoder().encode(text)]));

  expect(parseSkills({ files }, texts)).toMatchObject([
    { name: 'pdf-forms', skillHash: contentHash, origin: 'vendored' },
  ]);
});

test('it refuses a skill folder with no SKILL.md', () => {
  const texts = new Map([['skills/pdf-forms/scripts/fill.py', 'print("fill")\n']]);
  const files = new Map([...texts].map(([path, text]) => [path, new TextEncoder().encode(text)]));

  expect(() => parseSkills({ files }, texts)).toThrowWithMessage(
    Error,
    'skills/pdf-forms/SKILL.md: the skill has no SKILL.md',
  );
});

test('it refuses a file under skills/ that sits in no skill folder', () => {
  const texts = new Map([['skills/notes.md', '# Notes\n']]);
  const files = new Map([...texts].map(([path, text]) => [path, new TextEncoder().encode(text)]));

  expect(() => parseSkills({ files }, texts)).toThrowWithMessage(
    Error,
    "skills/notes.md: a file under skills/ belongs in a skill's folder",
  );
});

test('it refuses a lock entry that no skill folder matches', () => {
  const lock = JSON.stringify({
    'pdf-forms': {
      source: 'https://github.com/example/skills',
      path: 'skills/pdf-forms',
      commit: 'a'.repeat(40),
      contentHash: 'b'.repeat(64),
    },
  });

  const texts = new Map([['skills/skills.lock.json', lock]]);
  const files = new Map([...texts].map(([path, text]) => [path, new TextEncoder().encode(text)]));

  expect(() => parseSkills({ files }, texts)).toThrowWithMessage(
    Error,
    'skills/skills.lock.json: pdf-forms: no skill folder matches the entry',
  );
});

test('it names every problem of every skill in one refusal', () => {
  const texts = new Map([
    ['skills/pdf-forms/SKILL.md', '---\nname: forms\ndescription: Fills PDF forms.\n---\n'],
    ['skills/tide-tables/SKILL.md', '# Tides\n'],
  ]);

  const files = new Map([...texts].map(([path, text]) => [path, new TextEncoder().encode(text)]));

  expect(() => parseSkills({ files }, texts)).toThrowWithMessage(
    Error,
    'skills/pdf-forms/SKILL.md: the name forms differs from its folder name pdf-forms; ' +
      'skills/tide-tables/SKILL.md: the file does not open with YAML frontmatter between --- lines',
  );
});

test('it reads no skills from definitions with no skill folder', () => {
  expect(parseSkills({ files: new Map() }, new Map())).toStrictEqual([]);
});
