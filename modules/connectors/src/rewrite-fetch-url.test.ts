import { expect, test } from 'bun:test';
import { rewriteFetchURL } from './rewrite-fetch-url';

test.each([
  [
    'a GitHub blob page',
    'https://github.com/acme-labs/tidal-notes/blob/main/docs/guide.md#install',
    'https://raw.githubusercontent.com/acme-labs/tidal-notes/main/docs/guide.md',
  ],
  [
    'a GitHub blob page with ?plain=1',
    'https://github.com/acme-labs/tidal-notes/blob/main/README.md?plain=1',
    'https://raw.githubusercontent.com/acme-labs/tidal-notes/main/README.md',
  ],
  [
    'a GitHub tree page',
    'https://github.com/acme-labs/tidal-notes/tree/release/src/lib',
    'https://api.github.com/repos/acme-labs/tidal-notes/contents/src/lib?ref=release',
  ],
  [
    'a GitHub tree page whose ref holds & and +',
    'https://github.com/acme-labs/tidal-notes/tree/main&draft+2/src',
    'https://api.github.com/repos/acme-labs/tidal-notes/contents/src?ref=main%26draft%2B2',
  ],
  [
    'an npm package',
    'https://www.npmjs.com/package/tidepool',
    'https://registry.npmjs.org/tidepool/latest',
  ],
  [
    'an npm package with a trailing slash',
    'https://www.npmjs.com/package/tidepool/',
    'https://registry.npmjs.org/tidepool/latest',
  ],
  [
    'a scoped npm package',
    'https://www.npmjs.com/package/@acme/tidepool',
    'https://registry.npmjs.org/@acme%2Ftidepool/latest',
  ],
  [
    'an npm package version',
    'https://www.npmjs.com/package/tidepool/v/2.4.1',
    'https://registry.npmjs.org/tidepool/2.4.1',
  ],
  ['a PyPI project', 'https://pypi.org/project/reefkit/', 'https://pypi.org/pypi/reefkit/json'],
  [
    'a PyPI project with no trailing slash',
    'https://pypi.org/project/reefkit',
    'https://pypi.org/pypi/reefkit/json',
  ],
  [
    'a PyPI project version',
    'https://pypi.org/project/reefkit/1.2.0/',
    'https://pypi.org/pypi/reefkit/1.2.0/json',
  ],
  [
    'a Wikipedia article',
    'https://en.wikipedia.org/wiki/Lighthouse#History',
    'https://en.wikipedia.org/w/rest.php/v1/page/Lighthouse/html',
  ],
  [
    'a mobile Wikipedia article',
    'https://fr.m.wikipedia.org/wiki/Phare',
    'https://fr.wikipedia.org/w/rest.php/v1/page/Phare/html',
  ],
  [
    'a Wikipedia title with a slash',
    'https://en.wikipedia.org/wiki/Tide/Tables',
    'https://en.wikipedia.org/w/rest.php/v1/page/Tide%2FTables/html',
  ],
  [
    'a URL with a user name and password, dropping them',
    'https://user:secret@pypi.org/project/reefkit/',
    'https://pypi.org/pypi/reefkit/json',
  ],
])('it rewrites %s', (_name, url, expected) => {
  expect(rewriteFetchURL(url)).toBe(expected);
});

test.each([
  ['a URL that matches no rule', 'https://example.com/docs?page=2'],
  ['a rule host with a query string', 'https://pypi.org/project/reefkit/?utm=1'],
  [
    'a blob with ?plain=1 and another parameter',
    'https://github.com/a/b/blob/main/x.md?plain=1&x=1',
  ],
  ['a tree page with a query string', 'https://github.com/a/b/tree/main/src?plain=1'],
  ['an explicit port', 'https://pypi.org:8443/project/reefkit/'],
  ['an explicit default https port', 'https://pypi.org:443/project/reefkit/'],
  ['an explicit default http port', 'http://pypi.org:80/project/reefkit/'],
  ['text that is no URL', 'not a url'],
  ['a non-http scheme', 'ftp://pypi.org/project/reefkit/'],
  ['a tree page with no path', 'https://github.com/a/b/tree/main'],
  ['a blob with an empty segment', 'https://github.com/a/b/blob/main//x.md'],
  ['a blob with a trailing slash', 'https://github.com/a/b/blob/main/x/'],
  ['an npm package with an extra segment', 'https://www.npmjs.com/package/tidepool/extra'],
  ['a PyPI project with an extra segment', 'https://pypi.org/project/reefkit/1.0/more/'],
  ['the www Wikipedia host', 'https://www.wikipedia.org/wiki/Lighthouse'],
  ['a host that only ends in a rule host', 'https://evilgithub.com/a/b/blob/main/x.md'],
  ['a Wikipedia page outside /wiki/', 'https://en.wikipedia.org/w/index.php'],
])('it returns null for %s', (_name, url) => {
  expect(rewriteFetchURL(url)).toBeNull();
});
