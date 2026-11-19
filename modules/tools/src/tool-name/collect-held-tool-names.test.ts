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
