import { expect, test } from 'bun:test';
import { formatSpoolFileName } from './format-spool-file-name';
import { parseSpoolFileName } from './parse-spool-file-name';

test('it formats a part name', () => {
  const name = formatSpoolFileName({
    kind: 'part',
    captureID: '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3',
    writer: 'a1b2',
    counter: 3,
  });

  expect(name).toBe('3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.a1b2.3.part');
});

test('it formats a cap name with its upstream status', () => {
  const name = formatSpoolFileName({
    kind: 'cap',
    captureID: '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3',
    writer: 'a1b2',
    counter: 3,
    upstreamStatus: 529,
  });

  expect(name).toBe('3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.a1b2.3.529.cap');
});

test('it formats a miss name', () => {
  const name = formatSpoolFileName({
    kind: 'miss',
    captureID: '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3',
    writer: 'a1b2',
    counter: 12,
  });

  expect(name).toBe('3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3.a1b2.12.miss');
});

test('it formats a name that parseSpoolFileName reads back', () => {
  const name = {
    kind: 'cap',
    captureID: '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3',
    writer: 'c0ffee',
    counter: 7,
    upstreamStatus: 200,
  } as const;

  expect(parseSpoolFileName(formatSpoolFileName(name))).toStrictEqual(name);
});
