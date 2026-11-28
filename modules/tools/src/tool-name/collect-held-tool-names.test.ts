import { expect, test } from 'bun:test';
import { collectHeldToolNames } from './collect-held-tool-names';

test.each([
  ['nixie names', ['web_fetch', 'code.run'], ['web_fetch', 'code.run'], []],
  ['SDK names', ['mcp__nixie__web_fetch', 'mcp__nixie__code_run'], ['web_fetch', 'code.run'], []],
  ['both names of one tool', ['code.run', 'mcp__nixie__code_run'], ['code.run'], []],
  [
    'an unregistered name',
    ['code.run', 'mcp__nixie__pond_drain'],
    ['code.run'],
    ['mcp__nixie__pond_drain'],
  ],
])('it maps a list of %s to the registered names', (_case, listed, held, unknown) => {
  expect(collectHeldToolNames(listed, ['code.run', 'web_fetch', 'time.now'])).toStrictEqual({
    held,
    unknown,
  });
});

test('it expands a server entry to the tools of that server only', () => {
  const names = ['code.run', 'boxxy.item_get', 'boxxy.item_list', 'boxxy2.other', 'web_fetch'];

  expect(collectHeldToolNames(['boxxy.*'], names, ['boxxy', 'boxxy2'])).toStrictEqual({
    held: ['boxxy.item_get', 'boxxy.item_list'],
    unknown: [],
  });
});

test('it holds nothing for a server entry that has no tools yet', () => {
  expect(collectHeldToolNames(['boxxy.*'], ['code.run'], ['boxxy'])).toStrictEqual({
    held: [],
    unknown: [],
  });
});

test('it does not expand an entry of a prefix that is no configured server', () => {
  expect(collectHeldToolNames(['code.*'], ['code.run'], ['boxxy'])).toStrictEqual({
    held: [],
    unknown: ['code.*'],
  });
});

test('it holds a tool of a server that the list names by its own name', () => {
  expect(
    collectHeldToolNames(['boxxy.item_get'], ['boxxy.item_get', 'boxxy.item_list'], ['boxxy']),
  ).toStrictEqual({ held: ['boxxy.item_get'], unknown: [] });
});

test('it holds a tool of a server when the starter list holds the whole server', () => {
  expect(collectHeldToolNames(['boxxy.item_get'], ['boxxy.*'])).toStrictEqual({
    held: ['boxxy.item_get'],
    unknown: [],
  });
});
