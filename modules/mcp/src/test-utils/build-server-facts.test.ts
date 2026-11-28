import { expect, test } from 'bun:test';
import { buildServerFacts } from './build-server-facts';

test('#buildServerFacts replaces only the fact it is given', () => {
  expect(buildServerFacts({ scope: 'read' })).toStrictEqual({
    url: 'https://tracker.example.org/mcp',
    clientID: 'nixie-7f3a',
    scope: 'read',
    privateRange: null,
  });
});
