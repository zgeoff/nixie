import { expect, test } from 'bun:test';
import { isDefinitionsPath } from './is-definitions-path';

test.each([
  ['persona.md', true],
  ['nixie.yaml', true],
  ['tasks/morning/task.yaml', true],
  ['tasks/morning/instructions.md', true],
  ['tasks/morning/step.ts', true],
  ['tasks/morning/notes.json', false],
  ['tasks/morning/task.yml', false],
  ['jobs/morning.yaml', false],
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
  ['tasks/.draft.yaml', false],
  ['.persona.md', false],
  ['skills/pdf-forms/SKILL.md', true],
  ['skills/pdf-forms/scripts/fill.py', true],
  ['skills/pdf-forms/LICENSE', true],
  ['skills/pdf-forms/.cache/fill.pyc', false],
  ['scripts/fill.py', false],
  ['tasks/skills/fill.py', false],
])('it reads %s as a definitions path: %p', (path, expected) => {
  expect(isDefinitionsPath(path)).toBe(expected);
});
