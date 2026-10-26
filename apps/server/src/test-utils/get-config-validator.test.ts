import { expect, test } from 'bun:test';
import { getConfigValidator } from './get-config-validator';

test('it hands every caller the one compiled validator', () => {
  expect(getConfigValidator()).toBe(getConfigValidator());
});

test('it refuses a key the config schema does not hold', () => {
  const validate = getConfigValidator();

  validate({ orchard: { pears: 3 } });

  expect(validate.errors).toPartiallyContain({ keyword: 'additionalProperties' });
});
