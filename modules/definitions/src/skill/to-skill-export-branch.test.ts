import { expect, test } from 'bun:test';
import { toSkillExportBranch } from './to-skill-export-branch';

test("it names a skill's export branch under nixie/skill", () => {
  expect(toSkillExportBranch('tide-tables')).toBe('nixie/skill/tide-tables');
});
