import { expect, test } from 'bun:test';
import { buildFieldPageURL } from './build-field-page-url';

test('it builds a data URL of a page with the given title and a field that renames it to its encoded text', () => {
  const url = buildFieldPageURL('empty');
  const html = decodeURIComponent(url.slice('data:text/html,'.length));

  expect([url.startsWith('data:text/html,'), html]).toStrictEqual([
    true,
    expect.stringMatching(
      /^<title>empty<\/title>.*<textarea autofocus.*document\.title=encodeURIComponent\(this\.value\)/u,
    ),
  ]);
});
