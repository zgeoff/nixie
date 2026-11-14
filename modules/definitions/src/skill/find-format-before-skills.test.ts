import { expect, test } from 'bun:test';
import { findFormatBeforeSkills } from './find-format-before-skills';

test.each([
  ['a format before skills', 'format: 1\n', 1],
  ['the skills format', 'format: 2\n', null],
  ['no manifest', null, null],
  ['a manifest that is not YAML', 'format: [\n', null],
  ['a manifest with no format', 'persona: persona.md\n', null],
])('it finds the format of %s', (_label, manifest, format) => {
  expect(findFormatBeforeSkills(manifest)).toBe(format);
});
