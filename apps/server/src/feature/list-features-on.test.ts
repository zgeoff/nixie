import { expect, test } from 'bun:test';
import type { FeatureID } from '@heynixie/contract';
import type { FeatureConfig } from './list-features-on';
import { listFeaturesOn } from './list-features-on';

test.each<{ feature: FeatureID; config: FeatureConfig; on: FeatureID[] }>([
  {
    feature: 'computer',
    config: { images: null, search: { credential: null }, computer: {} },
    on: ['computer', 'devices', 'mcp'],
  },
  {
    feature: 'code',
    config: { images: null, search: { credential: null }, code: {} },
    on: ['code', 'devices', 'mcp'],
  },
  {
    feature: 'devices',
    config: { images: null, search: { credential: null } },
    on: ['devices', 'mcp'],
  },
  {
    feature: 'google',
    config: { images: null, search: { credential: null }, google: {} },
    on: ['devices', 'google', 'mcp'],
  },
  {
    feature: 'mcp',
    config: { images: null, search: { credential: null } },
    on: ['devices', 'mcp'],
  },
  {
    feature: 'voice',
    config: { images: null, search: { credential: null }, voice: {} },
    on: ['voice', 'devices', 'mcp'],
  },
  {
    feature: 'coding',
    config: { images: null, search: { credential: null }, coding: { atc: {} } },
    on: ['devices', 'mcp', 'coding'],
  },
  {
    feature: 'search',
    config: { images: null, search: { credential: 'kagi' } },
    on: ['devices', 'mcp', 'search'],
  },
  {
    feature: 'images',
    config: { images: {}, search: { credential: null } },
    on: ['devices', 'mcp', 'images'],
  },
  {
    feature: 'mail',
    config: { images: null, search: { credential: null }, mail: {} },
    on: ['devices', 'mcp', 'mail'],
  },
  {
    feature: 'phone',
    config: { images: null, search: { credential: null }, phone: {} },
    on: ['devices', 'google', 'mcp', 'phone'],
  },
  {
    feature: 'spend',
    config: { images: null, search: { credential: null }, spendStop: {} },
    on: ['devices', 'mcp', 'spend'],
  },
])('it turns $feature on by its rule, and no other feature beyond the always-on ones', (row) => {
  expect(listFeaturesOn(row.config)).toStrictEqual(row.on);
});

test('it leaves coding off when its section holds no atc', () => {
  const features = listFeaturesOn({ images: null, search: { credential: null }, coding: {} });

  expect(features).toStrictEqual(['devices', 'mcp']);
});

test('it leaves google off when the config has no google section', () => {
  const features = listFeaturesOn({ images: null, search: { credential: null } });

  expect(features).not.toContain('google');
});
