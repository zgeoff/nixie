import { expect, test } from 'bun:test';
import { buildPopupPageURL } from './build-popup-page-url';

test('it builds a data URL of a page with the given title and a button that opens a popup window', () => {
  const url = buildPopupPageURL('first');
  const html = decodeURIComponent(url.slice('data:text/html,'.length));

  expect([url.startsWith('data:text/html,'), html]).toStrictEqual([
    true,
    expect.stringMatching(/^<title>first<\/title>.*window\.open\('about:blank'.*popup,width=360/u),
  ]);
});
