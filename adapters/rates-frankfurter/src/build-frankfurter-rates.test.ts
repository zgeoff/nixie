import { expect, test } from 'bun:test';
import { network } from '@heynixie/mock-server';
import { HttpResponse, http } from 'msw';
import { buildFrankfurterRates } from './build-frankfurter-rates';

function setupTest() {
  return {
    rates: buildFrankfurterRates({
      apiURL: 'https://rates.example.test/v1/',
      fetch: globalThis.fetch,
    }),
  };
}

test('it reads the rate of one US dollar in the currency from the latest day', async () => {
  const ctx = setupTest();
  const seen: string[] = [];

  network.use(
    http.get('https://rates.example.test/v1/latest', (options) => {
      seen.push(new URL(options.request.url).search);

      return HttpResponse.json({
        amount: 1,
        base: 'USD',
        date: '2026-11-25',
        rates: { AUD: 1.5221 },
      });
    }),
  );

  const rate = await ctx.rates.readRate('AUD');

  expect({ rate, seen }).toStrictEqual({ rate: 1.5221, seen: ['?base=USD&symbols=AUD'] });
});

test('it gives no rate for a currency the reply lacks', async () => {
  const ctx = setupTest();

  network.use(
    http.get('https://rates.example.test/v1/latest', () =>
      HttpResponse.json({ amount: 1, base: 'USD', date: '2026-11-25', rates: {} }),
    ),
  );

  const rate = await ctx.rates.readRate('AUD');

  expect(rate).toBeNull();
});

test('it gives no rate for a reply that is not the source own', async () => {
  const ctx = setupTest();

  network.use(
    http.get('https://rates.example.test/v1/latest', () => HttpResponse.text('<html></html>')),
  );

  const rate = await ctx.rates.readRate('AUD');

  expect(rate).toBeNull();
});

test('it gives no rate for an error status', async () => {
  const ctx = setupTest();

  network.use(
    http.get('https://rates.example.test/v1/latest', () =>
      HttpResponse.json({ message: 'not found' }, { status: 404 }),
    ),
  );

  const rate = await ctx.rates.readRate('AUD');

  expect(rate).toBeNull();
});
