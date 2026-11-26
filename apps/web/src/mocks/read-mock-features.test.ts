import { expect, test } from 'bun:test';
import { featureIDs } from '@heynixie/contract';
import { featureStore } from './feature-store';
import { readMockFeatures } from './read-mock-features';

test('it reads every feature as on until a row says it is off', () => {
  expect(readMockFeatures()).toStrictEqual([...featureIDs]);
});

test('it leaves out a feature that a row says is off', async () => {
  await featureStore.featuresOff.create({ feature: 'voice' });

  expect(readMockFeatures()).toStrictEqual(featureIDs.filter((feature) => feature !== 'voice'));
});
