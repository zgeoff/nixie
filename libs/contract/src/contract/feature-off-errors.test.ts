import { expect, test } from 'bun:test';
import { featureOffErrors } from './feature-off-errors';

test('it carries the feature that is off as the data of FEATURE_OFF', () => {
  expect(featureOffErrors.FEATURE_OFF.data.parse({ feature: 'google' })).toStrictEqual({
    feature: 'google',
  });
});

test('it refuses a feature that nixie does not list', () => {
  expect(featureOffErrors.FEATURE_OFF.data.safeParse({ feature: 'telegram' }).success).toBe(false);
});
