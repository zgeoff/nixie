import { expect, test } from 'bun:test';
import { buildPKCEChallenge } from './build-pkce-challenge';

// the example of RFC 7636, appendix B
test('it builds the S256 challenge of the RFC 7636 example verifier', () => {
  expect(buildPKCEChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
});
