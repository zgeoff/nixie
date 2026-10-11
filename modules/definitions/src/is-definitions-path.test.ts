import { expect, test } from 'bun:test';
import { isDefinitionsPath } from './is-definitions-path';

test.each([
  ['persona.md', true],
  ['nixie.yaml', true],
  ['jobs/morning.yaml', true],
  ['rules/mail.yml', true],
  ['tools/limits.json', false],
  ['readme.md', false],
  ['docs/readme.md', false],
  ['notes/bad.json', false],
  ['rule/mail.yaml', false],
  ['rules/notes.txt', false],
  ['README.txt', false],
  ['scripts/seed.sh', false],
  ['persona', false],
  ['.github/workflow.yaml', false],
  ['jobs/.draft.yaml', false],
  ['.persona.md', false],
  ['skills/pdf-forms/SKILL.md', true],
  ['skills/pdf-forms/scripts/fill.py', true],
  ['skills/pdf-forms/LICENSE', true],
  ['skills/pdf-forms/.cache/fill.pyc', false],
  ['scripts/fill.py', false],
  ['jobs/skills/fill.py', false],
])('it reads %s as a definitions path: %p', (path, expected) => {
  expect(isDefinitionsPath(path)).toBe(expected);
});
