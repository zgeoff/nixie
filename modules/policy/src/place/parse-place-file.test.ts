import { expect, test } from 'bun:test';
import { parsePlaceFile } from './parse-place-file';

test('it reads a list of sites and mail domains with their levels and names', () => {
  const parsed = parsePlaceFile(
    [
      '- place: "*.library.example.org"',
      '  trust: read',
      '  name: The library',
      '- place: "@example.org"',
      '  trust: known',
      '- place: tickets.example.com',
      '  trust: act',
    ].join('\n'),
  );

  expect(parsed).toStrictEqual({
    status: 'parsed',
    places: [
      {
        key: { kind: 'site', domain: 'library.example.org', subdomains: true },
        trust: 'read',
        name: 'The library',
      },
      {
        key: { kind: 'mail_domain', domain: 'example.org', subdomains: false },
        trust: 'known',
        name: null,
      },
      {
        key: { kind: 'site', domain: 'tickets.example.com', subdomains: false },
        trust: 'act',
        name: null,
      },
    ],
  });
});

test('it reads an empty file as no places', () => {
  expect(parsePlaceFile('')).toStrictEqual({ status: 'parsed', places: [] });
});

test.each([
  ['an address', '- place: sam@example.org\n  trust: act\n', 'only a site or a mail domain'],
  ['a phone number', '- place: "+61420000000"\n  trust: act\n', 'only a site or a mail domain'],
  ['a key on a whole public suffix', '- place: "*.github.io"\n  trust: read\n', 'public suffix'],
  ['a mail domain at act', '- place: "@example.org"\n  trust: act\n', 'cannot be at act'],
  ['a level of self', '- place: example.org\n  trust: self\n', 'trust'],
  ['an unknown field', '- place: example.org\n  trust: read\n  why: no\n', 'why'],
  [
    'the same place twice',
    '- place: example.org\n  trust: read\n- place: www.example.org\n  trust: known\n',
    'twice',
  ],
])('it refuses the whole file for %s', (_title, text, reason) => {
  const parsed = parsePlaceFile(text);
  const problems = parsed.status === 'refused' ? parsed.problems.join('\n') : '';

  expect(problems).toInclude(reason);
});

test('it refuses a file with one bad line among good ones', () => {
  const parsed = parsePlaceFile(
    '- place: example.org\n  trust: read\n- place: not a place\n  trust: read\n',
  );

  expect(parsed.status).toBe('refused');
});

test('it refuses text that is not YAML', () => {
  expect(parsePlaceFile('- place: [').status).toBe('refused');
});
