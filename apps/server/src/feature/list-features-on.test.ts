import { expect, test } from 'bun:test';
import type { FeatureID } from '@heynixie/contract';
import type { FeatureConfig } from './list-features-on';
import { listFeaturesOn } from './list-features-on';

test.each<{ feature: FeatureID; config: FeatureConfig; on: FeatureID[] }>([
  {
    feature: 'computer',
    config: { images: null, search: { credential: null }, computer: {} },
    on: ['computer', 'mcp'],
  },
  {
    feature: 'code',
    config: { images: null, search: { credential: null }, code: {} },
    on: ['code', 'mcp'],
  },
  {
    feature: 'devices',
    config: { images: null, search: { credential: null }, devices: {} },
    on: ['devices', 'mcp'],
  },
  {
    feature: 'google',
    config: { images: null, search: { credential: null }, google: {} },
    on: ['google', 'mcp'],
  },
  {
    feature: 'mcp',
    config: { images: null, search: { credential: null } },
    on: ['mcp'],
  },
  {
    feature: 'voice',
    config: { images: null, search: { credential: null }, voice: {} },
    on: ['voice', 'mcp'],
  },
  {
    feature: 'coding',
    config: { images: null, search: { credential: null }, coding: { atc: {} } },
    on: ['mcp', 'coding'],
  },
  {
    feature: 'search',
    config: { images: null, search: { credential: 'kagi' } },
    on: ['mcp', 'search'],
  },
  {
    feature: 'images',
    config: { images: {}, search: { credential: null } },
    on: ['mcp', 'images'],
  },
  {
    feature: 'mail',
    config: { images: null, search: { credential: null }, mail: {} },
    on: ['mcp', 'mail'],
  },
  {
    feature: 'phone',
    config: { images: null, search: { credential: null }, phone: {} },
    on: ['mcp', 'phone'],
  },
  {
    feature: 'spend',
    config: { images: null, search: { credential: null }, spendStop: {} },
    on: ['mcp', 'spend'],
  },
])('it turns $feature on by its rule, and no other feature beyond the always-on ones', (row) => {
  expect(listFeaturesOn(row.config)).toStrictEqual(row.on);
});

test('it leaves coding off when its section holds no atc', () => {
  const features = listFeaturesOn({ images: null, search: { credential: null }, coding: {} });

  expect(features).toStrictEqual(['mcp']);
});

test('it leaves google off when the config has no google section', () => {
  const features = listFeaturesOn({ images: null, search: { credential: null } });

  expect(features).not.toContain('google');
});

test('it leaves devices off when the config has no devices section', () => {
  const features = listFeaturesOn({ images: null, search: { credential: null } });

  expect(features).not.toContain('devices');
});

test('it leaves voice off when the config has no voice section', () => {
  const features = listFeaturesOn({ images: null, search: { credential: null } });

  expect(features).not.toContain('voice');
});
