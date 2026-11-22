import { expect, test } from 'bun:test';
import { buildButtonPageURL } from './build-button-page-url';

test('it builds a data URL of a page with the given title and a button that renames it', () => {
  const url = buildButtonPageURL('first');
  const html = decodeURIComponent(url.slice('data:text/html,'.length));

  expect([url.startsWith('data:text/html,'), html]).toStrictEqual([
    true,
    expect.stringMatching(/^<title>first<\/title>.*document\.title='clicked'/u),
  ]);
});
