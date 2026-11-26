import { expect, test } from 'bun:test';
import { buildServerFacts } from './build-server-facts';

test('#buildServerFacts replaces only the fact it is given', () => {
  expect(buildServerFacts({ trusted: true })).toMatchObject({ scope: 'read write', trusted: true });
});
