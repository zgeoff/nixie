import { expect, test } from 'bun:test';
import { buildValueForms } from './build-value-forms';
import { scrubText } from './scrub-text';

function setupTest() {
  return { value: "fake-key/with+chars=1 (x)!'*" };
}

test.each([
  ['as it is', (value: string) => `a ${value} b`],
  ['URL-encoded', (value: string) => `a ${encodeURIComponent(value)} b`],
  [
    'URL-encoded with lower-case hex',
    (value: string) =>
      `a ${encodeURIComponent(value).replaceAll(/%[\dA-F]{2}/gu, (escape) => escape.toLowerCase())} b`,
  ],
  [
    'URL-encoded with the bare characters escaped',
    () => 'a fake-key%2Fwith%2Bchars%3D1%20%28x%29%21%27%2A b',
  ],
  ['in form encoding', () => "a fake-key%2Fwith%2Bchars%3D1+(x)!'* b"],
  ['URL-encoded with mixed-case hex', () => "a fake-key%2fwith%2Bchars%3d1%20(x)%21'%2a b"],
])('it cuts the value %s', (_name, build) => {
  const ctx = setupTest();
  const text = build(ctx.value);

  expect(scrubText(text, buildValueForms(ctx.value))).toBe('a [secret removed] b');
});

test.each([0, 1, 2])('it cuts the value in base64 text after %i bytes of prefix', (prefixBytes) => {
  const ctx = setupTest();
  const text = Buffer.from(`${'x'.repeat(prefixBytes)}${ctx.value}-tail`).toString('base64');

  expect(scrubText(text, buildValueForms(ctx.value))).toContain('[secret removed]');
});

test.each([0, 1, 2])(
  'it cuts a 1-byte value in base64 text after %i bytes of prefix',
  (prefixBytes) => {
    const text = Buffer.from(`${'?'.repeat(prefixBytes)}x`).toString('base64');

    expect(scrubText(text, buildValueForms('x'))).toContain('[secret removed]');
  },
);

test.each([0, 1, 2])(
  'it cuts a 4-byte value in base64 text after %i bytes of prefix',
  (prefixBytes) => {
    const text = Buffer.from(`${'x'.repeat(prefixBytes)}ab12-tail`).toString('base64');

    expect(scrubText(text, buildValueForms('ab12'))).toContain('[secret removed]');
  },
);

test('it cuts the value in URL-safe base64 text', () => {
  const ctx = setupTest();
  const text = Buffer.from(`user:${ctx.value}`).toString('base64url');

  expect(scrubText(text, buildValueForms(ctx.value))).toContain('[secret removed]');
});

test('it holds no form of an empty value', () => {
  expect(buildValueForms('')).toStrictEqual([]);
});
