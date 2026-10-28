import { expect, test } from 'bun:test';
import { buildBrowserRun } from './build-browser-run';
import { findBrowserRun } from './find-browser-run';

test('it finds the run that the lane command names', () => {
  expect(findBrowserRun({ NIXIE_BROWSER_RUN_ID: '4417' })).toStrictEqual(buildBrowserRun('4417'));
});

test.each([
  ['no run ID', {}],
  ['an empty run ID', { NIXIE_BROWSER_RUN_ID: '' }],
])('it finds no run with %s', (_, env) => {
  expect(findBrowserRun(env)).toBeNull();
});
