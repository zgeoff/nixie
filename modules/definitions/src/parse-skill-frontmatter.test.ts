import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { parseSkillFrontmatter } from './parse-skill-frontmatter';

test('it reads every field nixie keeps, and the body after the frontmatter', () => {
  const text = [
    '---',
    'name: pdf-forms',
    'description: Fills PDF forms. Use when a form needs filling.',
    'license: Apache-2.0',
    'compatibility: Needs Python 3.14 and pypdf',
    'allowed-tools: Bash(python:*) Read',
    'metadata:',
    '  author: example-org',
    '  version: "1.0"',
    'argument-hint: a form path',
    '---',
    '# Filling a form',
    '',
  ].join('\n');

  expect(parseSkillFrontmatter(text)).toStrictEqual({
    frontmatter: {
      name: 'pdf-forms',
      description: 'Fills PDF forms. Use when a form needs filling.',
      license: 'Apache-2.0',
      compatibility: 'Needs Python 3.14 and pypdf',
      allowedTools: 'Bash(python:*) Read',
      metadata: { author: 'example-org', version: '1.0' },
    },
    body: '# Filling a form\n',
  });
});

test.each([
  ['an uppercase letter', 'PDF-forms'],
  ['a leading hyphen', '-pdf'],
  ['a trailing hyphen', 'pdf-'],
  ['2 hyphens in a row', 'pdf--forms'],
  ['an underscore', 'pdf_forms'],
  ['65 characters', 'a'.repeat(65)],
])('it refuses a name with %s', (_label, name) => {
  const text = `---\nname: ${name}\ndescription: Fills PDF forms.\n---\n`;
  const reasons = parseSkillFrontmatter(text);

  invariant(Array.isArray(reasons));

  expect(reasons).toContainEqual(expect.stringMatching(/^name: /u));
});

test('it refuses a description longer than 1,024 characters', () => {
  const text = `---\nname: pdf-forms\ndescription: ${'a'.repeat(1025)}\n---\n`;

  expect(parseSkillFrontmatter(text)).toStrictEqual([
    'description: Too big: expected string to have <=1024 characters',
  ]);
});

test('it refuses a blank description', () => {
  const text = "---\nname: pdf-forms\ndescription: '  '\n---\n";

  expect(parseSkillFrontmatter(text)).toStrictEqual(['description: the description is empty']);
});

test('it refuses a frontmatter with no description', () => {
  const text = '---\nname: pdf-forms\n---\n';

  expect(parseSkillFrontmatter(text)).toStrictEqual([
    'description: Invalid input: expected string, received undefined',
  ]);
});

test('it refuses a compatibility field longer than 500 characters', () => {
  const text = `---\nname: pdf-forms\ndescription: Fills PDF forms.\ncompatibility: ${'a'.repeat(501)}\n---\n`;

  expect(parseSkillFrontmatter(text)).toStrictEqual([
    'compatibility: Too big: expected string to have <=500 characters',
  ]);
});

test('it refuses metadata whose value is not a string', () => {
  const text =
    '---\nname: pdf-forms\ndescription: Fills PDF forms.\nmetadata:\n  version: 1\n---\n';

  expect(parseSkillFrontmatter(text)).toStrictEqual([
    'metadata.version: Invalid input: expected string, received number',
  ]);
});

test('it refuses a file that does not open with frontmatter', () => {
  expect(parseSkillFrontmatter('# Filling a form\n')).toStrictEqual([
    'the file does not open with YAML frontmatter between --- lines',
  ]);
});

test('it refuses frontmatter that is a YAML list', () => {
  expect(parseSkillFrontmatter('---\n- pdf-forms\n---\n')).toStrictEqual([
    'the frontmatter is not a YAML mapping',
  ]);
});

test('it refuses frontmatter that is not YAML', () => {
  expect(parseSkillFrontmatter('---\nname: [pdf\n---\n')).toSatisfy(
    (reasons: unknown) =>
      Array.isArray(reasons) &&
      reasons.length === 1 &&
      String(reasons[0]).startsWith('the frontmatter is not YAML: '),
  );
});
