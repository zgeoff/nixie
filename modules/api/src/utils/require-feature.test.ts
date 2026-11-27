import { expect, test } from 'bun:test';
import { refuseFeature, requireFeature } from './require-feature';

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

test('#refuseFeature throws the FEATURE_OFF error that names the feature', () => {
  expect(() => {
    refuseFeature('devices', (input) => new Error(`${input.data.feature} is off`));
  }).toThrowWithMessage(Error, 'devices is off');
});
