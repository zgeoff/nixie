import { expect, test } from 'bun:test';
import { formatManifestIssue } from './format-manifest-issue';

test('it names each prompt that nixie does not have, with the prompts it has', () => {
  expect(
    formatManifestIssue({
      code: 'unrecognized_keys',
      keys: ['greeter'],
      path: ['prompts'],
      message: 'Unrecognized key: "greeter"',
      input: {},
    }),
  ).toStrictEqual([
    'prompts: no prompt is named greeter; the prompts are writer, consolidator, content-checker, retirement-checker, session, compaction',
  ]);
});

test('it names each part that a prompt does not have, with the parts it has', () => {
  expect(
    formatManifestIssue({
      code: 'unrecognized_keys',
      keys: ['tone'],
      path: ['prompts', 'compaction'],
      message: 'Unrecognized key: "tone"',
      input: {},
    }),
  ).toStrictEqual([
    'prompts.compaction: the prompt has no part tone; its parts are instruction, safety',
  ]);
});

test('it asks for the text of a template that is not text', () => {
  expect(
    formatManifestIssue({
      code: 'invalid_type',
      expected: 'string',
      path: ['prompts', 'compaction', '_template'],
      message: 'Invalid input',
      input: 3,
    }),
  ).toStrictEqual(['prompts.compaction._template must be text']);
});

test('it asks for the path of a file for a part that is not a path', () => {
  expect(
    formatManifestIssue({
      code: 'invalid_type',
      expected: 'string',
      path: ['prompts', 'compaction', 'safety'],
      message: 'Invalid input',
      input: 3,
    }),
  ).toStrictEqual(['prompts.compaction.safety must be the path of a file']);
});

test('it asks for a list of skill names for an issue outside the prompts map', () => {
  expect(
    formatManifestIssue({
      code: 'invalid_type',
      expected: 'array',
      path: ['skills'],
      message: 'Invalid input',
      input: 'tides',
    }),
  ).toStrictEqual(['skills must be a list of skill names']);
});
