import { expect, test } from 'bun:test';
import { makeOwnValueSearch } from './make-own-value-search';

function setupTest() {
  const encoder = new TextEncoder();

  return {
    search: makeOwnValueSearch(() => ['plain-own-secret-1', String.raw`quote"and\slash-secret`]),
    encode: (text: string) => encoder.encode(text),
  };
}

test('it finds an own value in plain form', () => {
  const ctx = setupTest();

  expect(ctx.search(ctx.encode('{"text":"a plain-own-secret-1 here"}'))).toBeTrue();
});

test('it finds an own value in its JSON-escaped form', () => {
  const ctx = setupTest();
  const body = ctx.encode(JSON.stringify({ text: String.raw`has quote"and\slash-secret inside` }));

  expect(ctx.search(body)).toBeTrue();
});

test('it finds nothing in a body with no own value, a token of another kind included', () => {
  const ctx = setupTest();

  expect(ctx.search(ctx.encode('{"text":"ghp_notownedbyanyonetokenvalue123456"}'))).toBeFalse();
});

test('it finds nothing with no own values', () => {
  expect(makeOwnValueSearch(() => [])(new TextEncoder().encode('anything'))).toBeFalse();
});

test('it reads the own values at each search, so a value added later is found', () => {
  const values: string[] = [];
  const search = makeOwnValueSearch(() => values);

  const body = new TextEncoder().encode('{"text":"late-own-secret-2"}');

  const before = search(body);

  values.push('late-own-secret-2');

  expect([before, search(body)]).toStrictEqual([false, true]);
});
