import { expect, test } from 'bun:test';
import { buildToolForm } from '../test-utils/build-tool-form';
import { listingLimits, pickListingRefusal } from './pick-listing-refusal';

function setupTest() {
  return { empty: { pages: 0, toolCount: 0, bytes: 0, names: new Set<string>() } };
}

test('it accepts a page within every limit', () => {
  const ctx = setupTest();

  expect(pickListingRefusal(ctx.empty, { bytes: 100, forms: [buildToolForm()] })).toBeNull();
});

test('it refuses the page that makes the 21st', () => {
  const ctx = setupTest();

  expect(
    pickListingRefusal({ ...ctx.empty, pages: listingLimits.pages }, { bytes: 1, forms: [] }),
  ).toBe('the listing runs over 20 pages');
});

test('it refuses a page that takes the listing past 200 tools', () => {
  const ctx = setupTest();

  const forms = Array.from({ length: 2 }, (_item, index) =>
    buildToolForm({ name: `tool${index}` }),
  );

  expect(pickListingRefusal({ ...ctx.empty, toolCount: 199 }, { bytes: 1, forms })).toBe(
    'the listing holds more than 200 tools',
  );
});

test('it refuses a page that takes the listing past 1 MiB', () => {
  const ctx = setupTest();

  expect(pickListingRefusal({ ...ctx.empty, bytes: 1024 * 1024 }, { bytes: 1, forms: [] })).toBe(
    'the listing is larger than 1048576 bytes',
  );
});

test('it refuses a tool schema over 64 KiB', () => {
  const ctx = setupTest();

  const form = buildToolForm({
    inputSchema: { type: 'object', description: 'x'.repeat(65 * 1024) },
  });

  expect(pickListingRefusal(ctx.empty, { bytes: 1, forms: [form] })).toBe(
    'a schema of the tool item_get is larger than 65536 bytes',
  );
});

test('it refuses a name that two pages both list', () => {
  const ctx = setupTest();

  const names = new Set(['item_get']);

  expect(pickListingRefusal({ ...ctx.empty, names }, { bytes: 1, forms: [buildToolForm()] })).toBe(
    'the listing holds two forms of the tool item_get',
  );
});

test('it refuses a name that one page lists twice', () => {
  const ctx = setupTest();

  expect(
    pickListingRefusal(ctx.empty, { bytes: 1, forms: [buildToolForm(), buildToolForm()] }),
  ).toBe('the listing holds two forms of the tool item_get');
});
