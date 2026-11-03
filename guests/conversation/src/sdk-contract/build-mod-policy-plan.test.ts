import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildModPolicyPlan } from './build-mod-policy-plan';

test.each([
  [
    'policy',
    'nixie-policy',
    ['MARK_NONE', 'MARK_DENY', 'MARK_REWRITE', 'MARK_ANSWER_TEXT', 'MARK_CHECK'],
  ],
  ['throw-load', 'nixie-throw-load', ['MARK_DENY']],
  ['throw-hook-catch', 'nixie-throw-hook-catch', ['MARK_NONE']],
  ['busy-loop', 'nixie-busy-loop', ['MARK_BLOCK', 'MARK_DENY']],
] as const)(
  'it loads the %s scenario mod %s and asks for its marked commands',
  (scenario, mod, marks) => {
    const plan = buildModPolicyPlan(scenario);

    expect(plan.mod).toBe(mod);
    expect(marks.filter((mark) => !plan.prompt.includes(mark))).toStrictEqual([]);
  },
);

test.each(['policy', 'throw-load', 'throw-hook-catch', 'busy-loop'] as const)(
  'it names a committed mod for the %s scenario',
  (scenario) => {
    const plan = buildModPolicyPlan(scenario);

    expect(existsSync(join(import.meta.dir, 'mods', plan.mod))).toBeTrue();
  },
);
