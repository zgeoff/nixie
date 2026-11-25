import { expect, test } from 'bun:test';
import { parseMail } from './parse-mail';

function setupTest() {
  return {
    buildRaw: (lines: readonly string[]) => Buffer.from(lines.join('\r\n'), 'utf8'),
  };
}

test('#parseMail reads the headers and the text of a plain mail', () => {
  const ctx = setupTest();

  const parsed = parseMail(
    ctx.buildRaw([
      'Message-ID: <abc123@library.example.org>',
      'From: The Library <Hello@Library.example.org>',
      'To: assistant@nixie.example.org',
      'Cc: Pat <pat@home.example.org>, lee@home.example.org',
      'Subject: Your sign-in code',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Your code is 482913.',
    ]),
  );

  expect(parsed).toStrictEqual({
    messageID: 'abc123@library.example.org',
    references: [],
    from: 'hello@library.example.org',
    to: ['assistant@nixie.example.org'],
    cc: ['pat@home.example.org', 'lee@home.example.org'],
    subject: 'Your sign-in code',
    text: 'Your code is 482913.',
    attachments: [],
  });
});

test('#parseMail lists the IDs that a reply answers, nearest first', () => {
  const ctx = setupTest();

  const parsed = parseMail(
    ctx.buildRaw([
      'Message-ID: <c@x.example.org>',
      'From: a@x.example.org',
      'In-Reply-To: <b@x.example.org>',
      'References: <a@x.example.org> <b@x.example.org>',
      'Subject: Re: lunch',
      '',
      'Yes.',
    ]),
  );

  expect(parsed.references).toStrictEqual([
    'b@x.example.org',
    'a@x.example.org',
    'b@x.example.org',
  ]);
});

test('#parseMail decodes an encoded subject', () => {
  const ctx = setupTest();
  const encoded = Buffer.from('Your café receipt', 'utf8').toString('base64');

  const parsed = parseMail(
    ctx.buildRaw(['From: a@x.example.org', `Subject: =?utf-8?B?${encoded}?=`, '', 'Thanks.']),
  );

  expect(parsed.subject).toBe('Your café receipt');
});

test.each([
  ['base64', 'Content-Transfer-Encoding: base64', Buffer.from('Reset: 4821').toString('base64')],
  ['quoted-printable', 'Content-Transfer-Encoding: quoted-printable', 'Reset=3A =\r\n4821'],
])('#parseMail decodes a %s body', (_name, header, body) => {
  const ctx = setupTest();

  const parsed = parseMail(
    ctx.buildRaw(['From: a@x.example.org', 'Subject: Reset', header, '', body]),
  );

  expect(parsed.text).toBe('Reset: 4821');
});

test('#parseMail prefers the plain part of a multipart mail and lists its attachments', () => {
  const ctx = setupTest();

  const parsed = parseMail(
    ctx.buildRaw([
      'From: a@x.example.org',
      'Subject: Board',
      'Content-Type: multipart/mixed; boundary="b1"',
      '',
      '--b1',
      'Content-Type: multipart/alternative; boundary="b2"',
      '',
      '--b2',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'See the board.',
      '--b2',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>See the <b>board</b>.</p>',
      '--b2--',
      '--b1',
      'Content-Type: image/png; name="board.png"',
      'Content-Disposition: attachment; filename="board.png"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('not really a picture').toString('base64'),
      '--b1--',
    ]),
  );

  expect([parsed.text, parsed.attachments]).toStrictEqual([
    'See the board.',
    [{ name: 'board.png', bytes: 20 }],
  ]);
});

test('#parseMail shows each link of an HTML mail beside its label', () => {
  const ctx = setupTest();

  const parsed = parseMail(
    ctx.buildRaw([
      'From: a@x.example.org',
      'Subject: Reset your password',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Tap <a href="https://library.example.org/reset?token=t0k3n">Reset password</a>.</p>',
      '<style>p { color: red }</style>',
    ]),
  );

  expect(parsed.text).toBe('Tap Reset password (https://library.example.org/reset?token=t0k3n).');
});

test('#parseMail reads a mail with no Message-ID header as one with none', () => {
  const ctx = setupTest();
  const parsed = parseMail(ctx.buildRaw(['From: a@x.example.org', 'Subject: Hi', '', 'Hello.']));

  expect(parsed.messageID).toBeNull();
});
