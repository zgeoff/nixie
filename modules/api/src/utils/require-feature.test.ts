import { expect, test } from 'bun:test';
import { requireFeature } from './require-feature';

test('#requireFeature throws the FEATURE_OFF error that names a feature that is off', () => {
  expect(() => {
    requireFeature(
      { features: ['voice'] },
      'google',
      (input) => new Error(`${input.data.feature} is off`),
    );
  }).toThrowWithMessage(Error, 'google is off');
});

test('#requireFeature returns for a feature that is on', () => {
  expect(() => {
    requireFeature({ features: ['voice'] }, 'voice', (input) => new Error(input.data.feature));
  }).not.toThrow();
});
