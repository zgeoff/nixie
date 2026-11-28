import { expect, test } from 'bun:test';
import { buildServerFacts } from './build-server-facts';

test('#buildServerFacts replaces only the fact it is given', () => {
  expect(buildServerFacts({ scope: 'read' })).toMatchObject({
    scope: 'read',
    clientID: 'nixie-7f3a',
  });
});
