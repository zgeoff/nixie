import { expect, test } from 'bun:test';
import { parseFakeRaw } from '../../test-utils/fake-gmail/parse-fake-raw';
import { buildRawMail } from './build-raw-mail';

function setupTest() {
  const draft = {
    messageID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03@example.test',
    from: 'me@example.test',
    to: ['sam@example.org'],
    cc: [],
    bcc: [],
    subject: 'Q3 numbers',
    text: 'Hi Sam,\nthe numbers are in.',
    html: null,
    files: [],
    inReplyTo: null,
    references: [],
    sentAtMs: Date.parse('2026-11-20T09:00:00Z'),
  } as const;

  return { draft };
}

test('it carries no header that names nixie or the action beyond the Message-ID', () => {
  const ctx = setupTest();
  const parsed = parseFakeRaw(buildRawMail(ctx.draft));

  expect(parsed.headers.map(([name]) => name)).toStrictEqual([
    'Date',
    'From',
    'To',
    'Subject',
    'Message-ID',
    'MIME-Version',
    'Content-Type',
    'Content-Transfer-Encoding',
  ]);
});

test('it writes the action ID in the Message-ID alone', () => {
  const ctx = setupTest();
  const raw = Buffer.from(buildRawMail(ctx.draft), 'base64url').toString('utf8');

  expect(raw.split(ctx.draft.messageID)).toHaveLength(2);
});

test('it never writes nixie into a header, a boundary or a filename of a mail with parts', () => {
  const ctx = setupTest();

  const raw = Buffer.from(
    buildRawMail({
      ...ctx.draft,
      html: '<p>Hi</p>',
      files: [{ name: 'q3.csv', type: 'text/csv', bytes: new TextEncoder().encode('a,b') }],
    }),
    'base64url',
  ).toString('utf8');

  expect(raw.toLowerCase()).not.toContain('nixie');
});

test('it writes the text body as UTF-8 that reads back whole', () => {
  const ctx = setupTest();
  const parsed = parseFakeRaw(buildRawMail({ ...ctx.draft, text: 'Grüße, 日本語' }));

  expect(new TextDecoder().decode(parsed.root.bytes)).toBe('Grüße, 日本語');
});

test('it encodes a subject with non-ASCII letters as an encoded word', () => {
  const ctx = setupTest();
  const parsed = parseFakeRaw(buildRawMail({ ...ctx.draft, subject: 'Zahlen für Q3' }));

  expect(parsed.headers.find(([name]) => name === 'Subject')?.[1]).toStartWith('=?UTF-8?B?');
});

test('it writes a mail with HTML and a file as a mixed message that holds the file whole', () => {
  const ctx = setupTest();

  const parsed = parseFakeRaw(
    buildRawMail({
      ...ctx.draft,
      html: '<p>Hi</p>',
      files: [{ name: 'q3.csv', type: 'text/csv', bytes: new TextEncoder().encode('a,b\n1,2') }],
    }),
  );

  const [, file] = parsed.root.parts;

  expect([
    parsed.root.mimeType,
    parsed.root.parts[0]?.mimeType,
    file?.filename,
    new TextDecoder().decode(file?.bytes),
  ]).toStrictEqual(['multipart/mixed', 'multipart/alternative', 'q3.csv', 'a,b\n1,2']);
});

test('it writes the headers of a reply that chain it to the message answered', () => {
  const ctx = setupTest();

  const parsed = parseFakeRaw(
    buildRawMail({
      ...ctx.draft,
      inReplyTo: 'orig@mail.test',
      references: ['first@mail.test', 'orig@mail.test'],
    }),
  );

  expect(
    parsed.headers.filter(([name]) => ['In-Reply-To', 'References'].includes(name)),
  ).toStrictEqual([
    ['In-Reply-To', '<orig@mail.test>'],
    ['References', '<first@mail.test> <orig@mail.test>'],
  ]);
});

test('it writes Bcc and Cc only when the mail has some', () => {
  const ctx = setupTest();

  const parsed = parseFakeRaw(
    buildRawMail({ ...ctx.draft, cc: ['kim@example.org'], bcc: ['lee@example.org'] }),
  );

  expect(parsed.headers.filter(([name]) => ['Cc', 'Bcc'].includes(name))).toStrictEqual([
    ['Cc', 'kim@example.org'],
    ['Bcc', 'lee@example.org'],
  ]);
});
