import type { OutgoingMail } from '../types';
import { hashMessageID } from './hash-message-id';
import { isMailAddress } from './is-mail-address';
import { isMessageIDText } from './is-message-id-text';

interface OutgoingFile {
  readonly name: string;
  readonly mediaType: string;
  readonly content: Uint8Array;
}

export interface OutgoingDraft {
  // the Message-ID without its angle brackets
  readonly messageID: string;
  readonly from: string;
  readonly to: readonly string[];
  readonly subject: string;
  readonly text: string;

  // the IDs that the mail answers, nearest first, without angle brackets
  readonly references: readonly string[];

  // the files the mail carries
  readonly files: readonly OutgoingFile[];

  // epoch ms
  readonly sentAt: number;
}

// Builds the RFC 5322 message of a send, or null when an address or an ID that a header would carry
// is not printable ASCII, because the headers go out as Latin-1 and a character past it would change
// the address or end the header. The text travels in base64, so no line of it needs care.
export function buildOutgoingMail(draft: OutgoingDraft): OutgoingMail | null {
  const isSafe =
    isMailAddress(draft.from) &&
    draft.to.length > 0 &&
    draft.to.every((address) => isMailAddress(address)) &&
    [draft.messageID, ...draft.references].every((id) => isMessageIDText(id));

  if (!isSafe) {
    return null;
  }

  const answered = draft.references.map((id) => `<${id}>`);
  const [nearest] = answered;

  const headers = [
    `Message-ID: <${draft.messageID}>`,
    `Date: ${new Date(draft.sentAt).toUTCString()}`,
    `From: ${draft.from}`,
    `To: ${draft.to.join(', ')}`,
    `Subject: ${buildSubjectHeader(draft.subject)}`,
    ...(nearest === undefined
      ? []
      : [`In-Reply-To: ${nearest}`, `References: ${answered.join(' ')}`]),
    'MIME-Version: 1.0',
  ];

  const text = [
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBase64Lines(Buffer.from(draft.text, 'utf8')),
  ];

  if (draft.files.length === 0) {
    return { raw: buildRaw([...headers, ...text]) };
  }

  const boundary = `nixie-${hashMessageID(draft.messageID)}`;

  return {
    raw: buildRaw([
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      ...text,
      ...draft.files.flatMap((file) => buildFilePart(file, boundary)),
      `--${boundary}--`,
    ]),
  };
}

function buildSubjectHeader(subject: string): string {
  const clean = subject.replaceAll(/[\r\n]+/gu, ' ');

  return /^[ -~]*$/u.test(clean)
    ? clean
    : `=?utf-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

function encodeBase64Lines(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replaceAll(/(?<line>.{76})/gu, '$<line>\r\n');
}

function buildRaw(lines: readonly string[]): Uint8Array {
  const split = lines.indexOf('');
  const head = lines.slice(0, split).join('\r\n');
  const body = lines.slice(split + 1).join('\r\n');

  return Buffer.from(`${head}\r\n\r\n${body}\r\n`, 'latin1');
}

// A part's lines open with a blank line that ends the part before it, so each part follows the
// boundary line of the last.
function buildFilePart(file: OutgoingFile, boundary: string): string[] {
  const name = buildParameterValue(file.name);

  return [
    `--${boundary}`,
    `Content-Type: ${file.mediaType}; name=${name}`,
    `Content-Disposition: attachment; filename=${name}`,
    'Content-Transfer-Encoding: base64',
    '',
    encodeBase64Lines(file.content),
  ];
}

// A file name as a header parameter: quoted when plain printable ASCII, else an encoded word.
function buildParameterValue(name: string): string {
  return /^[ !#-[\]-~]*$/u.test(name)
    ? `"${name}"`
    : `"=?utf-8?B?${Buffer.from(name, 'utf8').toString('base64')}?="`;
}
