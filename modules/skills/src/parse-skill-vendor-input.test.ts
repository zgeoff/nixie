import { expect, test } from 'bun:test';
import { parseSkillVendorInput } from './parse-skill-vendor-input';

test('it reads a GitHub URL, a folder path and a full commit SHA', () => {
  expect(
    parseSkillVendorInput({
      repository: 'https://github.com/example/skills.git',
      path: '/skills/pdf-forms/',
      commit: '3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52',
    }),
  ).toStrictEqual({
    status: 'ok',
    source: {
      owner: 'example',
      name: 'skills',
      repository: 'https://github.com/example/skills',
      path: 'skills/pdf-forms',
      commit: '3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52',
    },
  });
});

test.each([
  ['a branch name', 'main'],
  ['a short SHA', '3f6c1a5'],
  ['an uppercase SHA', '3F6C1A528E0B4D7A9C215B7E4F0D9A133F6C1A52'],
  ['a SHA with a ref suffix', '3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52^'],
])('it refuses %s as the commit', (_label, commit) => {
  expect(
    parseSkillVendorInput({
      repository: 'https://github.com/example/skills',
      path: 'skills/pdf-forms',
      commit,
    }),
  ).toStrictEqual({
    status: 'refused',
    reason: `${commit} is not a full commit SHA. Give all 40 lowercase hex characters of the commit, never a branch, a tag or a short SHA, because only a full SHA pins a version that cannot move.`,
  });
});

test.each([
  ['plain http', 'http://github.com/example/skills'],
  ['another host', 'https://gitlab.example/example/skills'],
  ['a tree URL', 'https://github.com/example/skills/tree/main'],
  ['a URL with a query', 'https://github.com/example/skills?tab=readme'],
  ['a URL with a user', 'https://someone@github.com/example/skills'],
])('it refuses %s as the repository', (_label, repository) => {
  expect(
    parseSkillVendorInput({
      repository,
      path: 'skills/pdf-forms',
      commit: '3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52',
    }),
  ).toStrictEqual({
    status: 'refused',
    reason: `${repository} is not a GitHub repository URL; give one such as https://github.com/example/skills`,
  });
});

test.each([
  ['the repository root', ''],
  ['a parent part', 'skills/../secrets'],
  ['a dot part', 'skills/./pdf-forms'],
  ['an empty part', 'skills//pdf-forms'],
])('it refuses %s as the path', (_label, path) => {
  expect(
    parseSkillVendorInput({
      repository: 'https://github.com/example/skills',
      path,
      commit: '3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52',
    }),
  ).toStrictEqual({
    status: 'refused',
    reason: `${path} is not a folder path inside the repository; give the skill's folder, such as skills/pdf-forms, with no . or .. parts`,
  });
});

test('it refuses an input whose fields are not strings', () => {
  expect(
    parseSkillVendorInput({
      repository: 'https://github.com/example/skills',
      path: 'skills/pdf-forms',
      commit: 42,
    }),
  ).toStrictEqual({
    status: 'refused',
    reason: 'give the repository, the path and the commit, each as a string',
  });
});
