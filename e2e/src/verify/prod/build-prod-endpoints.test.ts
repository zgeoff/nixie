import { expect, test } from 'bun:test';
import { buildProdEndpoints } from './build-prod-endpoints';

test('it takes the web origin from NIXIE_PROD_URL', () => {
  expect(buildProdEndpoints({ NIXIE_PROD_URL: 'https://nixie.example.test/chat' })).toStrictEqual({
    web: 'https://nixie.example.test',
  });
});

test('it names no endpoint when NIXIE_PROD_URL is unset', () => {
  expect(buildProdEndpoints({})).toStrictEqual({});
});
