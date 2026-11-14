import { expect, test } from 'bun:test';
import { toSkillVendorBranch } from './to-skill-vendor-branch';

test("it names a vendored skill's branch under nixie/vendor", () => {
  expect(toSkillVendorBranch('tide-tables')).toBe('nixie/vendor/tide-tables');
});
