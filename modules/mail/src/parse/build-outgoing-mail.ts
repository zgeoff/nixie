import type { OutgoingMail } from '../types';
import { isMailAddress } from './is-mail-address';
import { isMessageIDText } from './is-message-id-text';

export interface OutgoingDraft {
  // the Message-ID without its angle brackets
  readonly messageID: string;
  readonly from: string;
  readonly to: readonly string[];
  readonly subject: string;
  readonly text: string;

  // the IDs that the mail answers, nearest first, without angle brackets
  readonly references: readonly string[];

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
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
  ];

  const body = Buffer.from(draft.text, 'utf8')
    .toString('base64')
    .replaceAll(/(?<line>.{76})/gu, '$<line>\r\n');

  return { raw: Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}\r\n`, 'latin1') };
}

function buildSubjectHeader(subject: string): string {
  const clean = subject.replaceAll(/[\r\n]+/gu, ' ');

  return /^[ -~]*$/u.test(clean)
    ? clean
    : `=?utf-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}
