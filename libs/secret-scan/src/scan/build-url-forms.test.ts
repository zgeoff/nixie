import { expect, test } from 'bun:test';
import { buildURLForms } from './build-url-forms';

test('it gives the URL as given, decoded, and split into decoded lines', () => {
  expect(buildURLForms('https://host.test/a%2Fb/c?k=v%26w&x=1#frag')).toStrictEqual([
    'https://host.test/a%2Fb/c?k=v%26w&x=1#frag',
    'https://host.test/a/b/c?k=v&w&x=1#frag',
    'https:\n\nhost.test\na/b\nc\nk=v&w\nx=1\nfrag',
  ]);
});

test('it does not split a line at an encoded separator', () => {
  const forms = buildURLForms('https://host.test/p?token=ab%26cd&next=1');

  expect(forms[2]?.split('\n')).toContain('token=ab&cd');
});

test('it gives forms for a URL with a malformed escape', () => {
  expect(buildURLForms('https://host.test/%zz%')).toHaveLength(3);
});
