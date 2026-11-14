import { expect, test } from 'bun:test';
import { formatSpoolFileName } from './format-spool-file-name';
import { parseSpoolFileName } from './parse-spool-file-name';

test('#parseSpoolFileName reads a part name', () => {
  expect(parseSpoolFileName('3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.a1b2.3.part')).toStrictEqual({
    kind: 'part',
    captureID: '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3',
    writer: 'a1b2',
    counter: 3,
  });
});

test('#parseSpoolFileName reads a cap name with its upstream status', () => {
  expect(parseSpoolFileName(`3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.a1b2.3.200.cap`)).toStrictEqual({
    kind: 'cap',
    captureID: '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3',
    writer: 'a1b2',
    counter: 3,
    upstreamStatus: 200,
  });
});

test('#parseSpoolFileName reads a miss name', () => {
  expect(parseSpoolFileName(`3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.a1b2.12.miss`)).toStrictEqual({
    kind: 'miss',
    captureID: '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3',
    writer: 'a1b2',
    counter: 12,
  });
});

test.each([
  ['an unknown extension', `3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.a1b2.3.tmp`],
  ['a part name with a status', `3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.a1b2.3.200.part`],
  ['a cap name with no status', `3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.a1b2.3.cap`],
  ['an uppercase writer', `3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.A1B2.3.part`],
  ['a leading zero in the counter', `3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.a1b2.03.part`],
  ['a counter of 0', `3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.a1b2.0.part`],
  ['a leading zero in the status', `3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.a1b2.3.0200.cap`],
  ['a signed counter', `3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.a1b2.+3.part`],
  ['a capture ID that is not a UUID', 'abc.a1b2.3.part'],
  ['an empty name', ''],
])('#parseSpoolFileName returns null for %s', (_title, name) => {
  expect(parseSpoolFileName(name)).toBeNull();
});

test.each([
  [
    'part',
    { kind: 'part', captureID: '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3', writer: 'ab', counter: 1 },
    `3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.ab.1.part`,
  ],
  [
    'cap',
    {
      kind: 'cap',
      captureID: '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3',
      writer: 'ab',
      counter: 2,
      upstreamStatus: 429,
    },
    `3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.ab.2.429.cap`,
  ],
  [
    'miss',
    { kind: 'miss', captureID: '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3', writer: 'ab', counter: 3 },
    `3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.ab.3.miss`,
  ],
] as const)('#formatSpoolFileName writes a %s name that parses back', (_kind, name, text) => {
  expect(formatSpoolFileName(name)).toBe(text);
  expect(parseSpoolFileName(text)).toStrictEqual(name);
});
