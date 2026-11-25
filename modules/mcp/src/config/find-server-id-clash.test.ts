import { expect, test } from 'bun:test';
import { findServerIDClash } from './find-server-id-clash';

test.each([
  { title: 'an underscore', toolNames: ['web_fetch', 'time_now'], tool: 'web_fetch' },
  { title: 'a dot', toolNames: ['time_now', 'web.fetch'], tool: 'web.fetch' },
])('it finds a server ID that a tool name starts with, after $title', (row) => {
  expect(findServerIDClash(['tracker', 'web'], row.toolNames)).toStrictEqual({
    serverID: 'web',
    tool: row.tool,
  });
});

test('it finds no clash for a tool that only shares letters with the ID', () => {
  expect(findServerIDClash(['web'], ['website_open', 'time_now'])).toBeNull();
});

test('it finds no clash when no server is configured', () => {
  expect(findServerIDClash([], ['web_fetch'])).toBeNull();
});
