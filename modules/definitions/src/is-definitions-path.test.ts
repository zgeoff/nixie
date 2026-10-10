import { expect, test } from 'bun:test';
import { isDefinitionsPath } from './is-definitions-path';

test.each([
  ['persona.md', true],
  ['jobs/morning.yaml', true],
  ['rules/mail.yml', true],
  ['tools/limits.json', true],
  ['README.txt', false],
  ['scripts/seed.sh', false],
  ['persona', false],
  ['.github/workflow.yaml', false],
  ['jobs/.draft.yaml', false],
  ['.persona.md', false],
])('it reads %s as a definitions path: %p', (path, expected) => {
  expect(isDefinitionsPath(path)).toBe(expected);
});
