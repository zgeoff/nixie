import { expect, test } from 'bun:test';
import { parseSkillsLock } from './parse-skills-lock';

test('it reads the lock entry of each vendored skill by its name', () => {
  const entry = {
    source: 'https://github.com/example/skills',
    path: 'skills/pdf-forms',
    commit: 'a'.repeat(40),
    contentHash: 'b'.repeat(64),
  };

  expect(parseSkillsLock(JSON.stringify({ 'pdf-forms': entry }))).toStrictEqual({
    entries: { 'pdf-forms': entry },
    problems: [],
  });
});

test('it reads no lock entries when the definitions hold no lock', () => {
  expect(parseSkillsLock(undefined)).toStrictEqual({ entries: {}, problems: [] });
});

test('it refuses a lock entry with a short commit', () => {
  const entry = {
    source: 'https://github.com/example/skills',
    path: 'skills/pdf-forms',
    commit: 'a1b2c3d',
    contentHash: 'b'.repeat(64),
  };

  expect(parseSkillsLock(JSON.stringify({ 'pdf-forms': entry }))).toStrictEqual({
    entries: {},
    problems: [
      { path: 'skills/skills.lock.json', reason: 'pdf-forms.commit: use the full commit SHA' },
    ],
  });
});

test('it refuses a lock entry with a source that is not an https URL', () => {
  const entry = {
    source: 'http://github.com/example/skills',
    path: 'skills/pdf-forms',
    commit: 'a'.repeat(40),
    contentHash: 'b'.repeat(64),
  };

  expect(parseSkillsLock(JSON.stringify({ 'pdf-forms': entry })).problems).toPartiallyContain({
    path: 'skills/skills.lock.json',
    reason: expect.toStartWith('pdf-forms.source: '),
  });
});

test('it refuses a lock that is not JSON', () => {
  expect(parseSkillsLock('{"pdf-forms":')).toStrictEqual({
    entries: {},
    problems: [{ path: 'skills/skills.lock.json', reason: 'the lock is not a JSON object' }],
  });
});
