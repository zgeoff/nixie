import { expect, test } from 'bun:test';
import { decisionSchema } from './decision-schema';

test.each([['owner'], ['task'], [null]])(
  'it accepts a legacy destination whose permission is %p',
  (permission) => {
    const result = decisionSchema.safeParse({
      outcome: 'allow',
      stage: 1,
      rule: null,
      destinations: [{ destination: 'owner@example.test', permission }],
    });

    expect(result.success).toBe(true);
  },
);

test('it rejects a legacy destination whose permission is job', () => {
  const result = decisionSchema.safeParse({
    outcome: 'allow',
    stage: 1,
    rule: null,
    destinations: [{ destination: 'owner@example.test', permission: 'job' }],
  });

  expect(result.success).toBe(false);
});
