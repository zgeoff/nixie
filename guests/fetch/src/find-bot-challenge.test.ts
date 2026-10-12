import { expect, test } from 'bun:test';
import { findBotChallenge } from './find-bot-challenge';

test.each([
  {
    label: 'a 403 with cf-mitigated: challenge',
    status: 403,
    headers: { 'cf-mitigated': 'challenge' },
    body: null,
  },
  {
    label: 'a 503 with cf-mitigated: challenge',
    status: 503,
    headers: { 'cf-mitigated': 'challenge' },
    body: null,
  },
  {
    label: 'a cf-mitigated value in another case',
    status: 403,
    headers: { 'cf-mitigated': ' Challenge ' },
    body: null,
  },
  {
    label: 'a repeated cf-mitigated header',
    status: 403,
    headers: { 'cf-mitigated': ['other', 'challenge'] },
    body: null,
  },
  {
    label: 'a 403 whose body sets _cf_chl_opt',
    status: 403,
    headers: {},
    body: '<script>window._cf_chl_opt={}</script>',
  },
  {
    label: 'a 503 whose body loads the challenge platform',
    status: 503,
    headers: {},
    body: '/cdn-cgi/challenge-platform/h/g',
  },
])('it finds a Cloudflare challenge in $label', (row) => {
  expect(findBotChallenge(row.status, row.headers, row.body)).toBe(
    "blocked by the site's bot protection (Cloudflare challenge)",
  );
});

test.each([
  {
    label: 'a 200 with cf-mitigated: challenge',
    status: 200,
    headers: { 'cf-mitigated': 'challenge' },
    body: null,
  },
  {
    label: 'a 200 page about the challenge platform',
    status: 200,
    headers: {},
    body: 'window._cf_chl_opt',
  },
  {
    label: 'a 404 whose body sets _cf_chl_opt',
    status: 404,
    headers: {},
    body: 'window._cf_chl_opt',
  },
  {
    label: 'a 403 with another cf-mitigated value',
    status: 403,
    headers: { 'cf-mitigated': 'block' },
    body: null,
  },
  { label: 'a 403 with no challenge', status: 403, headers: {}, body: '<p>Forbidden</p>' },
])('it finds no challenge in $label', (row) => {
  expect(findBotChallenge(row.status, row.headers, row.body)).toBeNull();
});
