import { expect, test } from 'bun:test';
import { parseCodeRunInput } from './code-run-input';

test('it takes an input with no files and no skills', () => {
  expect(parseCodeRunInput({ language: 'bash', program: 'echo 1' })).toStrictEqual({
    kind: 'ok',
    input: { language: 'bash', program: 'echo 1', files: [], skills: [] },
  });
});

test.each([
  { name: 'an empty segment', path: 'a//b' },
  { name: 'a leading slash', path: '/a' },
  { name: 'a dot segment', path: 'a/./b' },
  { name: 'a dotdot segment', path: '../a' },
  { name: 'a folder out/', path: 'out/a.csv' },
  { name: 'the name out', path: 'out' },
  { name: 'a space', path: 'my file.csv' },
  { name: 'more than 200 characters', path: 'a'.repeat(201) },
])('it refuses a path with $name', (row) => {
  const parsed = parseCodeRunInput({
    language: 'python',
    program: 'x',
    files: [{ path: row.path, file: 'f8k2m4q9za' }],
  });

  expect(parsed.kind).toBe('refused');
});

test.each([
  {
    name: 'the same path twice',
    files: [
      { path: 'a.csv', file: 'f1' },
      { path: 'a.csv', page: 'p1' },
    ],
  },
  {
    name: 'a path that is a folder of another',
    files: [
      { path: 'a', file: 'f1' },
      { path: 'a/b', file: 'f2' },
    ],
  },
])('it refuses $name', (row) => {
  const parsed = parseCodeRunInput({ language: 'python', program: 'x', files: row.files });

  expect(parsed.kind).toBe('refused');
});

test('it refuses a skill named twice', () => {
  const parsed = parseCodeRunInput({
    language: 'python',
    program: 'x',
    skills: ['pdf-forms', 'pdf-forms'],
  });

  expect(parsed.kind).toBe('refused');
});

test('it refuses an input with an extra key', () => {
  const parsed = parseCodeRunInput({ language: 'python', program: 'x', network: true });

  expect(parsed.kind).toBe('refused');
});
