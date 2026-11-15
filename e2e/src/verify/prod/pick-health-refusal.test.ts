import { expect, test } from 'bun:test';
import { pickHealthRefusal } from './pick-health-refusal';

test('it accepts a ready report', () => {
  expect(
    pickHealthRefusal({
      status: 'ready',
      parts: { database: { isReady: true } },
      dependencies: {},
    }),
  ).toBeNull();
});

test.each([
  ['degraded', { imp_host: { isReady: false } }, 'nixie reports degraded: imp_host'],
  ['unready', { database: { isReady: false } }, 'nixie reports unready: database'],
] as const)('it refuses a %s report and names each failing part', (status, parts, message) => {
  expect(pickHealthRefusal({ status, parts: {}, dependencies: parts })).toBe(message);
});
