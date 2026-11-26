export interface RawMailFile {
  readonly name: string;
  readonly type: string;
  readonly bytes: Uint8Array;
}

export interface RawMailDraft {
  // without angle brackets
  readonly messageID: string;
  readonly from: string;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly bcc: readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly html: string | null;
  readonly files: readonly RawMailFile[];

  // the Message-ID of the mail answered, without angle brackets; null for a new mail
  readonly inReplyTo: string | null;
  readonly references: readonly string[];
  readonly sentAtMs: number;
}

// The MIME message of a send, as the base64url text that Gmail's send and draft calls take. The
// only header that names the send is Message-ID, and no header names nixie.
export function buildRawMail(draft: RawMailDraft): string {
  const headers = [
    ['Date', new Date(draft.sentAtMs).toUTCString()],
    ['From', draft.from],
    ['To', draft.to.join(', ')],
    ...(draft.cc.length === 0 ? [] : [['Cc', draft.cc.join(', ')]]),
    ...(draft.bcc.length === 0 ? [] : [['Bcc', draft.bcc.join(', ')]]),
    ['Subject', encodeHeaderText(draft.subject)],
    ['Message-ID', `<${draft.messageID}>`],
    ...(draft.inReplyTo === null ? [] : [['In-Reply-To', `<${draft.inReplyTo}>`]]),
    ...(draft.references.length === 0
      ? []
      : [['References', draft.references.map((id) => `<${id}>`).join(' ')]]),
    ['MIME-Version', '1.0'],
  ] as const;

  const body = buildBody(draft);

  const lines = [
    ...headers.map(([name, value]) => `${name}: ${value}`),
    ...body.headers,
    '',
    body.text,
  ];

  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

function encodeHeaderText(text: string): string {
  return /^[ -~]*$/u.test(text)
    ? text
    : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

interface MimeBody {
  readonly headers: readonly string[];
  readonly text: string;
}

function buildBody(draft: RawMailDraft): MimeBody {
  const textPart = buildTextPart('text/plain', draft.text);

  const readable =
    draft.html === null
      ? textPart
      : buildMultipart('alternative', [textPart, buildTextPart('text/html', draft.html)]);

  return draft.files.length === 0
    ? readable
    : buildMultipart('mixed', [readable, ...draft.files.map((file) => buildFilePart(file))]);
}

function buildTextPart(type: string, text: string): MimeBody {
  return {
    headers: [`Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64'],
    text: wrapBase64(Buffer.from(text, 'utf8').toString('base64')),
  };
}

function wrapBase64(encoded: string): string {
  return (encoded.match(/.{1,76}/gu) ?? ['']).join('\r\n');
}

function buildMultipart(kind: 'alternative' | 'mixed', parts: readonly MimeBody[]): MimeBody {
  const boundary = `=_${crypto.randomUUID().replaceAll('-', '')}`;

  const text = [
    ...parts.flatMap((part) => [`--${boundary}`, ...part.headers, '', part.text]),
    `--${boundary}--`,
  ].join('\r\n');

  return { headers: [`Content-Type: multipart/${kind}; boundary="${boundary}"`], text };
}

function buildFilePart(file: RawMailFile): MimeBody {
  const name = encodeHeaderText(file.name);

  return {
    headers: [
      `Content-Type: ${file.type}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      'Content-Transfer-Encoding: base64',
    ],
    text: wrapBase64(Buffer.from(file.bytes).toString('base64')),
  };
}
