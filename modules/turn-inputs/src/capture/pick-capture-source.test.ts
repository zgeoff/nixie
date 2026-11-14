import { expect, test } from 'bun:test';
import { pickCaptureSource } from './pick-capture-source';

function setupTest() {
  return {
    sources: {
      gateway: { baseURL: 'https://gw.example.test', directory: '/spool' },
      nested: { baseURL: 'https://other.example.test/api', directory: '/spool-b' },
    },
  };
}

test.each([
  ['https://gw.example.test/claude', 'gateway'],
  ['https://gw.example.test', 'gateway'],
  ['https://other.example.test/api/route', 'nested'],
])('it matches %s to the %s source', (url, name) => {
  const ctx = setupTest();

  expect(pickCaptureSource(ctx.sources, url)?.name).toBe(name);
});

test.each([
  'https://gw.example.test.evil.test/claude',
  'http://gw.example.test/claude',
  'https://gw.example.test:8443/claude',
  'https://other.example.test/apix/route',
  'https://other.example.test/',
  'not a url',
])('it matches %s to no source', (url) => {
  const ctx = setupTest();

  expect(pickCaptureSource(ctx.sources, url)).toBeNull();
});
