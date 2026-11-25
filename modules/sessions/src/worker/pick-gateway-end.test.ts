import { expect, test } from 'bun:test';
import { pickGatewayEnd } from './pick-gateway-end';

test.each([
  [
    { outcome: 'model_failed', detail: 'a 403' },
    { dollars: 2.1, tokens: 10, tripped: true, lastRefusal: null },
    'dollars',
  ],
  [
    { outcome: 'model_failed', detail: 'a 403' },
    { dollars: 0.5, tokens: 2_000_000, tripped: true, lastRefusal: null },
    'tokens',
  ],
  [
    { outcome: 'no_answer' },
    { dollars: 2, tokens: 10, tripped: true, lastRefusal: null },
    'dollars',
  ],
  [
    { outcome: 'limit', limit: 'turns' },
    { dollars: 0.5, tokens: 2_000_000, tripped: true, lastRefusal: null },
    'tokens',
  ],
  [
    { outcome: 'interrupted' },
    { dollars: 0.5, tokens: 2_000_000, tripped: true, lastRefusal: null },
    'tokens',
  ],
] as const)('it ends %j at a gateway trip as a %s limit', (end, count, limit) => {
  expect(pickGatewayEnd(end, count, { dollars: 2 })).toStrictEqual({ outcome: 'limit', limit });
});

test.each([
  [{ outcome: 'answered', answer: 'yes' }],
  [{ outcome: 'aborted' }],
  [{ outcome: 'sandbox_failed', detail: 'no imp' }],
  [{ outcome: 'limit', limit: 'minutes' }],
  [{ outcome: 'limit', limit: 'dollars' }],
] as const)('it keeps the end %j at a gateway trip', (end) => {
  expect(
    pickGatewayEnd(
      end,
      { dollars: 3, tokens: 1, tripped: true, lastRefusal: null },
      { dollars: 2 },
    ),
  ).toStrictEqual(end);
});

test('it keeps the end when the sandbox is under its limit', () => {
  expect(
    pickGatewayEnd(
      { outcome: 'no_answer' },
      { dollars: 1, tokens: 1, tripped: false, lastRefusal: null },
      { dollars: 2 },
    ),
  ).toStrictEqual({ outcome: 'no_answer' });
});

test('it keeps the end when the gateway gave no count', () => {
  expect(pickGatewayEnd({ outcome: 'no_answer' }, null, { dollars: 2 })).toStrictEqual({
    outcome: 'no_answer',
  });
});
