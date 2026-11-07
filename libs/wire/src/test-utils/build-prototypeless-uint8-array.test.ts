import { expect, spyOn, test } from 'bun:test';
import { buildPrototypelessUint8Array } from './build-prototypeless-uint8-array';

test('it builds arrays of the real type', () => {
  const StandIn = buildPrototypelessUint8Array(Uint8Array);

  expect(new StandIn([1, 2])).toStrictEqual(new Uint8Array([1, 2]));
});

test('it reads its prototype as null, so a spy on one of its methods cannot install', () => {
  const StandIn = buildPrototypelessUint8Array(Uint8Array);

  expect(() => spyOn(StandIn.prototype, 'set')).toThrow();
});
