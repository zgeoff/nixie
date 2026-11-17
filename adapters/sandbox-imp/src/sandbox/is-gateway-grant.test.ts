import { expect, test } from 'bun:test';
import { isGatewayGrant } from './is-gateway-grant';

test('it accepts a grant limited to the sandbox path on a secret that sends to the gateway', () => {
  expect(
    isGatewayGrant({
      sandboxID: 'nixie-abc',
      spec: { grants: [{ secret: 's1', host: 'api.example.test', env: {} }] },
      modelURL: 'http://10.0.0.2:8789',
      grants: [{ secret: 's1', paths: ['/nixie-abc/**'] }],
      upstreams: { s1: ['http://10.0.0.2:8789'] },
    }),
  ).toBe(true);
});

test.each([
  ['has no path filter', [{ secret: 's1', paths: null }], { s1: ['http://10.0.0.2:8789'] }],
  [
    'is limited to another sandbox',
    [{ secret: 's1', paths: ['/nixie-other/**'] }],
    { s1: ['http://10.0.0.2:8789'] },
  ],
  [
    'is on a secret that sends to another upstream',
    [{ secret: 's1', paths: ['/nixie-abc/**'] }],
    { s1: ['http://10.9.9.9:8789'] },
  ],
  ['is on a secret with no upstream', [{ secret: 's1', paths: ['/nixie-abc/**'] }], { s1: [null] }],
  ['is on a secret that impd lacks', [{ secret: 's1', paths: ['/nixie-abc/**'] }], { s1: null }],
  ['is missing', [], { s1: ['http://10.0.0.2:8789'] }],
] as const)('it refuses a grant that %s', (_name, grants, upstreams) => {
  expect(
    isGatewayGrant({
      sandboxID: 'nixie-abc',
      spec: { grants: [{ secret: 's1', host: 'api.example.test', env: {} }] },
      modelURL: 'http://10.0.0.2:8789',
      grants,
      upstreams,
    }),
  ).toBe(false);
});
