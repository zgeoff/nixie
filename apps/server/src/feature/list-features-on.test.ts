import { expect, test } from 'bun:test';
import type { FeatureID } from '@heynixie/contract';
import type { FeatureConfig } from './list-features-on';
import { listFeaturesOn } from './list-features-on';

test.each<{ feature: FeatureID; config: FeatureConfig; on: FeatureID[] }>([
  {
    feature: 'computer',
    config: { images: null, computer: {} },
    on: ['computer', 'mcp'],
  },
  {
    feature: 'code',
    config: { images: null, code: {} },
    on: ['code', 'mcp'],
  },
  {
    feature: 'devices',
    config: { images: null, devices: {} },
    on: ['devices', 'mcp'],
  },
  {
    feature: 'google',
    config: { images: null, google: {} },
    on: ['google', 'mcp'],
  },
  {
    feature: 'mcp',
    config: { images: null },
    on: ['mcp'],
  },
  {
    feature: 'voice',
    config: { images: null, voice: {} },
    on: ['voice', 'mcp'],
  },
  {
    feature: 'coding',
    config: { images: null, coding: { atc: {} } },
    on: ['mcp', 'coding'],
  },
  {
    feature: 'search',
    config: { images: null, search: {} },
    on: ['mcp', 'search'],
  },
  {
    feature: 'images',
    config: { images: {} },
    on: ['mcp', 'images'],
  },
  {
    feature: 'mail',
    config: { images: null, mail: {} },
    on: ['mcp', 'mail'],
  },
  {
    feature: 'phone',
    config: { images: null, phone: {} },
    on: ['mcp', 'phone'],
  },
  {
    feature: 'spend',
    config: { images: null, spendStop: {} },
    on: ['mcp', 'spend'],
  },
])('it turns $feature on by its rule, and no other feature beyond the always-on ones', (row) => {
  expect(listFeaturesOn(row.config)).toStrictEqual(row.on);
});

test('it leaves coding off when its section holds no atc', () => {
  const features = listFeaturesOn({ images: null, coding: {} });

  expect(features).toStrictEqual(['mcp']);
});

test('it leaves google off when the config has no google section', () => {
  const features = listFeaturesOn({ images: null });

  expect(features).not.toContain('google');
});

test('it leaves devices off when the config has no devices section', () => {
  const features = listFeaturesOn({ images: null });

  expect(features).not.toContain('devices');
});

test('it leaves voice off when the config has no voice section', () => {
  const features = listFeaturesOn({ images: null });

  expect(features).not.toContain('voice');
});

test('it leaves search off when the config has no search section', () => {
  const features = listFeaturesOn({ images: null });

  expect(features).not.toContain('search');
});

test('it leaves images off when the config sets no images section', () => {
  const features = listFeaturesOn({ images: null });

  expect(features).not.toContain('images');
});
