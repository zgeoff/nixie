import { expect, test } from 'bun:test';
import { buildCacheURL } from './build-cache-url';

test.each([
  ['a URL with a fragment', 'https://harbour.test/ferries#nine', 'https://harbour.test/ferries'],
  ['a bare host', 'https://harbour.test', 'https://harbour.test/'],
  ['an upper-case host', 'https://HARBOUR.test/a?b=1', 'https://harbour.test/a?b=1'],
])('#buildCacheURL prints %s as the parser does, with no fragment', (_name, url, expected) => {
  expect(buildCacheURL(url)).toBe(expected);
});

test('#buildCacheURL returns null for a URL the parser rejects', () => {
  expect(buildCacheURL('not a url')).toBeNull();
});
