import { expect, test } from 'bun:test';
import type { FeatureID } from '@heynixie/contract';
import type { FeatureConfig } from './list-features-on';
import { listFeaturesOn } from './list-features-on';

test('it keeps the always-on features on a bare config', () => {
  const features = listFeaturesOn({ images: null, search: { credential: null } });

  expect(features).toStrictEqual(['computer', 'code', 'devices', 'google', 'mcp']);
});

test.each<{ feature: FeatureID; config: FeatureConfig }>([
  { feature: 'voice', config: { images: null, search: { credential: null }, voice: {} } },
  { feature: 'images', config: { images: {}, search: { credential: null } } },
  { feature: 'mail', config: { images: null, search: { credential: null }, mail: {} } },
  {
    feature: 'coding',
    config: { images: null, search: { credential: null }, coding: { atc: {} } },
  },
  { feature: 'spend', config: { images: null, search: { credential: null }, spendStop: {} } },
  { feature: 'search', config: { images: null, search: { credential: 'kagi' } } },
])('it turns $feature on when its section is set', (row) => {
  expect(listFeaturesOn(row.config)).toContain(row.feature);
});

test('it leaves coding off when its section holds no atc', () => {
  const features = listFeaturesOn({ images: null, search: { credential: null }, coding: {} });

  expect(features).not.toContain('coding');
});
