import { expect, test } from 'bun:test';
import { buildValueForms } from './build-value-forms';

function setupTest() {
  return { value: "fake-key/with+chars=1 (x)!'*" };
}

test('it holds the value as it is and URL-encoded', () => {
  const ctx = setupTest();

  expect(buildValueForms(ctx.value)).toIncludeAllMembers([
    ctx.value,
    encodeURIComponent(ctx.value),
  ]);
});

test('it holds the value URL-encoded with lower-case hex', () => {
  const ctx = setupTest();

  expect(buildValueForms(ctx.value)).toContain(
    encodeURIComponent(ctx.value).replaceAll(/%[\dA-F]{2}/gu, (escape) => escape.toLowerCase()),
  );
});

test('it holds the value with the characters encodeURIComponent leaves bare escaped', () => {
  const ctx = setupTest();

  expect(buildValueForms(ctx.value)).toContain('fake-key%2Fwith%2Bchars%3D1%20%28x%29%21%27%2A');
});

test('it holds the value in form encoding, with a plus for each space', () => {
  const ctx = setupTest();

  expect(buildValueForms(ctx.value)).toContain("fake-key%2Fwith%2Bchars%3D1+(x)!'*");
});

test.each([0, 1, 2])(
  'it finds the value in base64 text after %i bytes of prefix',
  (prefixBytes) => {
    const ctx = setupTest();
    const text = Buffer.from(`${'x'.repeat(prefixBytes)}${ctx.value}-tail`).toString('base64');

    expect(buildValueForms(ctx.value).some((form) => text.includes(form))).toBe(true);
  },
);

test.each([0, 1, 2])(
  'it finds a 4-byte value in base64 text after %i bytes of prefix',
  (prefixBytes) => {
    const text = Buffer.from(`${'x'.repeat(prefixBytes)}ab12-tail`).toString('base64');

    expect(buildValueForms('ab12').some((form) => text.includes(form))).toBe(true);
  },
);

test('it finds the value in URL-safe base64 text', () => {
  const ctx = setupTest();
  const text = Buffer.from(`user:${ctx.value}`).toString('base64url');

  expect(buildValueForms(ctx.value).some((form) => text.includes(form))).toBe(true);
});

test('it holds no form of an empty value', () => {
  expect(buildValueForms('')).toStrictEqual([]);
});
