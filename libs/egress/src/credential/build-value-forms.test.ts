import { expect, test } from 'bun:test';
import { buildValueForms } from './build-value-forms';

function setupTest() {
  return { value: 'fake-key/with+chars=1' };
}

test('it holds the value as it is and URL-encoded', () => {
  const ctx = setupTest();

  expect(buildValueForms(ctx.value)).toIncludeAllMembers([
    ctx.value,
    encodeURIComponent(ctx.value),
  ]);
});

test.each([0, 1, 2])(
  'it finds the value in base64 text after %i bytes of prefix',
  (prefixBytes) => {
    const ctx = setupTest();
    const text = Buffer.from(`${'x'.repeat(prefixBytes)}${ctx.value}-tail`).toString('base64');

    expect(buildValueForms(ctx.value).some((form) => text.includes(form))).toBe(true);
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
