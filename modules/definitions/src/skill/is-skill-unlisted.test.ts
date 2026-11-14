import { expect, test } from 'bun:test';
import { isSkillUnlisted } from './is-skill-unlisted';

test.each([
  ['a list without the skill', 'format: 2\nskills: [harbour-hours]\n', true],
  ['a list with the skill', 'format: 2\nskills: [tide-tables]\n', false],
  ['no list', 'format: 2\n', false],
  ['no manifest', null, false],
])('it answers whether %s leaves the skill out', (_label, manifest, isUnlisted) => {
  expect(isSkillUnlisted(manifest, 'tide-tables')).toBe(isUnlisted);
});
