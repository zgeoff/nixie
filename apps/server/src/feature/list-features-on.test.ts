import { expect, test } from 'bun:test';
import type { FeatureID } from '@heynixie/contract';
import type { FeatureConfig } from './list-features-on';
import { listFeaturesOn } from './list-features-on';

test.each<{ feature: FeatureID; config: FeatureConfig; on: FeatureID[] }>([
  {
    feature: 'computer',
    config: { images: null, search: { credential: null } },
    on: ['computer', 'code', 'devices', 'google', 'mcp'],
  },
  {
    feature: 'code',
    config: { images: null, search: { credential: null } },
    on: ['computer', 'code', 'devices', 'google', 'mcp'],
  },
  {
    feature: 'devices',
    config: { images: null, search: { credential: null } },
    on: ['computer', 'code', 'devices', 'google', 'mcp'],
  },
  {
    feature: 'google',
    config: { images: null, search: { credential: null } },
    on: ['computer', 'code', 'devices', 'google', 'mcp'],
  },
  {
    feature: 'mcp',
    config: { images: null, search: { credential: null } },
    on: ['computer', 'code', 'devices', 'google', 'mcp'],
  },
  {
    feature: 'voice',
    config: { images: null, search: { credential: null }, voice: {} },
    on: ['computer', 'code', 'voice', 'devices', 'google', 'mcp'],
  },
  {
    feature: 'coding',
    config: { images: null, search: { credential: null }, coding: { atc: {} } },
    on: ['computer', 'code', 'devices', 'google', 'mcp', 'coding'],
  },
  {
    feature: 'search',
    config: { images: null, search: { credential: 'kagi' } },
    on: ['computer', 'code', 'devices', 'google', 'mcp', 'search'],
  },
  {
    feature: 'images',
    config: { images: {}, search: { credential: null } },
    on: ['computer', 'code', 'devices', 'google', 'mcp', 'images'],
  },
  {
    feature: 'mail',
    config: { images: null, search: { credential: null }, mail: {} },
    on: ['computer', 'code', 'devices', 'google', 'mcp', 'mail'],
  },
  {
    feature: 'spend',
    config: { images: null, search: { credential: null }, spendStop: {} },
    on: ['computer', 'code', 'devices', 'google', 'mcp', 'spend'],
  },
])('it turns $feature on by its rule, and no other feature beyond the always-on ones', (row) => {
  expect(listFeaturesOn(row.config)).toStrictEqual(row.on);
});

test('it leaves coding off when its section holds no atc', () => {
  const features = listFeaturesOn({ images: null, search: { credential: null }, coding: {} });

  expect(features).toStrictEqual(['computer', 'code', 'devices', 'google', 'mcp']);
});
