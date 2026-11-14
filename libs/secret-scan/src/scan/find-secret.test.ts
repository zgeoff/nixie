import { expect, test } from 'bun:test';
import { publicRules } from '../generated/public-rules.generated';
import { buildKey } from '../test-utils/build-key';
import { compilePattern } from './compile-pattern';
import { findSecret } from './find-secret';

test.each([
  ['a GitHub token', 'github-pat', `ghp_${buildKey('alphanumeric', 36)}`],
  [
    'a Slack token',
    'slack-bot-token',
    `xoxb-${buildKey('digits', 11)}-${buildKey('digits', 12)}-${buildKey('alphanumeric', 24)}`,
  ],
  ['a Stripe token', 'stripe-access-token', `sk_live_${buildKey('alphanumeric', 30)}`],
])(
  'it finds %s in the path and in the first, middle and last query parameter',
  (_name, rule, token) => {
    expect(
      [
        `https://api.host.test/v1/${token}/items`,
        `https://api.host.test/v1/items?id=${token}&page=2&sort=asc`,
        `https://api.host.test/v1/items?page=2&id=${token}&sort=asc`,
        `https://api.host.test/v1/items?page=2&sort=asc&id=${token}`,
      ].map((url) => findSecret(url)),
    ).toStrictEqual([{ rule }, { rule }, { rule }, { rule }]);
  },
);

test.each([
  ['abuseipdb-api-key.1', `abuseipdb=${buildKey('hex', 80)}`],
  ['airtable-api-key', `airtable=${buildKey('lowercaseAlphanumeric', 17)}`],
  ['generic-api-key', `api_key=${buildKey('alphanumeric', 32)}`],
])(
  'it finds a %s assignment as the first, middle and last query parameter and in a path segment',
  (rule, assignment) => {
    expect(
      [
        `https://api.host.test/v1/items?${assignment}&page=2&sort=asc`,
        `https://api.host.test/v1/items?page=2&${assignment}&sort=asc`,
        `https://api.host.test/v1/items?page=2&sort=asc&${assignment}`,
        `https://api.host.test/v1/${assignment}/items`,
      ].map((url) => findSecret(url)),
    ).toStrictEqual([{ rule }, { rule }, { rule }, { rule }]);
  },
);

test('it finds a token whose underscore is percent-encoded', () => {
  const token = `ghp%5F${buildKey('alphanumeric', 36)}`;

  expect(findSecret(`https://api.host.test/v1/items?id=${token}`)).toStrictEqual({
    rule: 'github-pat',
  });
});

test('it finds an assignment whose separator is percent-encoded', () => {
  const assignment = `abuseipdb%3D${buildKey('hex', 80)}`;

  expect(findSecret(`https://api.host.test/v1/items?${assignment}`)).toStrictEqual({
    rule: 'abuseipdb-api-key.1',
  });
});

test('it reports no finding for a URL with a malformed percent sequence', () => {
  expect(findSecret('https://host.test/100%/%zz?q=%E2%82')).toBeNull();
});

test('it reports no finding for a token whose companion rule has no match', () => {
  const key = `AKIA${buildKey('base32', 16)}`;

  expect(findSecret(`https://api.host.test/v1/items?id=${key}`)).toBeNull();
});

test.each([
  [
    'a GitHub raw blob URL',
    'https://raw.githubusercontent.com/acme-labs/tidal-notes/main/docs/guide.md',
  ],
  [
    'a GitHub tree target',
    'https://api.github.com/repos/acme-labs/tidal-notes/contents/src/lib?ref=release',
  ],
  ['an npm registry target', 'https://registry.npmjs.org/@acme%2Ftidepool/latest'],
  ['a PyPI JSON target', 'https://pypi.org/pypi/reefkit/1.2.0/json'],
  ['a Wikipedia target', 'https://en.wikipedia.org/w/rest.php/v1/page/Tide%2FTables/html'],
  [
    'a URL with a 40-character commit hash',
    'https://github.com/acme-labs/tidal-notes/commit/9f2c1d7a4b8e3056a1d9c7e2f4b6a8d0c3e5f791',
  ],
  ['a URL with a UUID', 'https://host.test/items/6f1c2b9e-3a4d-4e5f-8a7b-9c0d1e2f3a4b'],
  [
    'a URL with a long opaque query value',
    `https://host.test/search?cursor=${buildKey('alphanumeric', 80)}&page=2`,
  ],
])('it passes %s', (_name, url) => {
  expect(findSecret(url)).toBeNull();
});

test('it compiles every rule regex of the rule file on re2js', () => {
  const patterns = publicRules.map((rule) => rule.regex);

  expect(patterns.map((pattern) => compilePattern(pattern).pattern())).toStrictEqual(patterns);
});

test('it scans a 16 KB hostile URL in linear time', () => {
  const keywords = [...new Set(publicRules.flatMap((rule) => rule.keywords ?? []))].join('=');
  const run = `${buildKey('alphanumeric', 64)}-_.`.repeat(225);
  const url = `https://host.test/${keywords}=${run}`;
  const startedAt = performance.now();

  findSecret(url);

  expect(url.length).toBeGreaterThan(15_000);
  expect(performance.now() - startedAt).toBeLessThan(4000);
});
