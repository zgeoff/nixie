import { expect, test } from 'bun:test';
import { createOwnValueSet } from './create-own-value-set';

function setupTest() {
  const ownValues = createOwnValueSet();

  ownValues.add({ group: 'connector_credentials', name: 'search', value: 'fake-search-value' });
  ownValues.add({ group: 'model_credentials', name: 'anthropic', value: 'fake-model-value' });
  ownValues.add({ group: 'settings', name: 'owner', value: 'Wren Halloway' });

  return { ownValues };
}

test('it reads every value but the private settings when a scan names no entries', () => {
  const ctx = setupTest();

  expect(ctx.ownValues.read({ minChars: 8 })).toStrictEqual([
    'fake-search-value',
    'fake-model-value',
  ]);
});

test('it reads only the entries a scan names', () => {
  const ctx = setupTest();

  expect(ctx.ownValues.read({ entries: ['settings'], minChars: 8 })).toStrictEqual([
    'Wren Halloway',
  ]);
});

test('it leaves out a value shorter than the minimum', () => {
  const ctx = setupTest();

  expect(ctx.ownValues.read({ minChars: 16 })).toStrictEqual([
    'fake-search-value',
    'fake-model-value',
  ]);
});

test('it reads a value added after an earlier read, at the next read', () => {
  const ctx = setupTest();

  ctx.ownValues.read({ minChars: 8 });
  ctx.ownValues.add({ group: 'connector_credentials', name: 'late', value: 'fake-late-value' });

  expect(ctx.ownValues.read({ minChars: 8 })).toContain('fake-late-value');
});

test('it replaces the value of an entry that changed', () => {
  const ctx = setupTest();

  ctx.ownValues.add({
    group: 'connector_credentials',
    name: 'search',
    value: 'fake-rotated-value',
  });

  expect(ctx.ownValues.read({ minChars: 8 })).toStrictEqual([
    'fake-rotated-value',
    'fake-model-value',
  ]);
});

test('it drops a value once its entry is removed', () => {
  const ctx = setupTest();

  ctx.ownValues.remove('model_credentials', 'anthropic');

  expect(ctx.ownValues.read({ minChars: 8 })).toStrictEqual(['fake-search-value']);
});

test('it reads an always entry whatever the filter leaves out', () => {
  const ctx = setupTest();

  ctx.ownValues.add({
    group: 'settings',
    name: 'spend',
    value: 'fake-spend-value',
    isAlways: true,
  });

  expect(ctx.ownValues.read({ entries: ['model_credentials'], minChars: 8 })).toStrictEqual([
    'fake-model-value',
    'fake-spend-value',
  ]);
});
