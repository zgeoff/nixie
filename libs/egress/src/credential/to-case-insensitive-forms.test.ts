import { expect, test } from 'bun:test';
import { buildValueForms } from './build-value-forms';
import { scrubText } from './scrub-text';
import { toCaseInsensitiveForms } from './to-case-insensitive-forms';

test('it cuts a lower-cased value that the plain forms miss', () => {
  const forms = buildValueForms('Fake-Key-ABC');

  expect(scrubText('x-fake-key-abc', toCaseInsensitiveForms(forms))).toBe('x-[secret removed]');
});

test('it leaves text that holds no form', () => {
  const forms = buildValueForms('Fake-Key-ABC');

  expect(scrubText('x-other', toCaseInsensitiveForms(forms))).toBe('x-other');
});
