import { expect, test } from 'bun:test';
import { parseVendoredSkill } from './parse-vendored-skill';

test('it names the skill by its frontmatter and returns its files with LF line endings', () => {
  expect(
    parseVendoredSkill('skills/tide-tables', [
      {
        path: 'SKILL.md',
        text: '---\r\nname: tide-tables\r\ndescription: Reads a tide table.\r\n---\r\n# Tides\r\n',
      },
      { path: 'scripts/read.py', text: 'print(1)\n' },
    ]),
  ).toMatchObject({
    status: 'ok',
    skill: {
      name: 'tide-tables',
      skillHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      files: new Map([
        ['SKILL.md', '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n'],
        ['scripts/read.py', 'print(1)\n'],
      ]),
    },
  });
});

test('it refuses a folder with no SKILL.md', () => {
  expect(
    parseVendoredSkill('skills/tide-tables', [{ path: 'README.md', text: '# Tides\n' }]),
  ).toStrictEqual({
    status: 'refused',
    reason: 'skills/tide-tables holds no SKILL.md with valid frontmatter, so it is no skill',
  });
});

test('it refuses a SKILL.md whose frontmatter is not valid', () => {
  expect(
    parseVendoredSkill('skills/tide-tables', [
      { path: 'SKILL.md', text: '---\nname: Tide Tables\ndescription: Reads a tide table.\n---\n' },
    ]),
  ).toStrictEqual({
    status: 'refused',
    reason: 'skills/tide-tables holds no SKILL.md with valid frontmatter, so it is no skill',
  });
});

test('it refuses a skill that fails the checks the seed runs, with each problem', () => {
  expect(
    parseVendoredSkill('skills/tide-tables', [
      { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
      { path: 'notes.md', text: 'Read the ‮table.\n' },
    ]),
  ).toStrictEqual({
    status: 'refused',
    reason:
      'the skill fails the checks the seed runs, so nixie cannot vendor it:\nskills/tide-tables/notes.md: line 1 holds U+202E, a hidden or bidirectional control character',
  });
});
