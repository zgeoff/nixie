import type { ParsedMail } from '../types';
import { collectAddresses } from './collect-addresses';
import { collectParts } from './collect-parts';
import { decodeHeaderWords } from './decode-header-words';
import { parseHeaders } from './parse-headers';
import { splitMessage } from './split-message';

// Reads a raw RFC 5322 message. Only the mail module reads mail, and every text it returns came from
// outside nixie.
export function parseMail(raw: Uint8Array): ParsedMail {
  const latin1 = Buffer.from(raw).toString('latin1');
  const split = splitMessage(latin1);

  // an 8-bit header holds UTF-8 bytes, which the latin1 reading splits
  const headers = parseHeaders(Buffer.from(split.head, 'latin1').toString('utf8'));
  const parts = collectParts(latin1);
  const text = parts.texts.length > 0 ? parts.texts.join('\n') : parts.htmls.join('\n');
  const answered = [...(headers.get('in-reply-to') ?? []), ...(headers.get('references') ?? [])];

  return {
    messageID: collectIDs(headers.get('message-id') ?? [])[0] ?? null,
    references: collectIDs(answered),
    from: collectAddresses(headers.get('from') ?? [])[0] ?? '',
    to: collectAddresses(headers.get('to') ?? []),
    cc: collectAddresses(headers.get('cc') ?? []),
    subject: decodeHeaderWords(headers.get('subject')?.[0] ?? ''),
    text: text.trim(),
    attachments: parts.attachments,
  };
}

const idPattern = /<(?<id>[^<>\s]+)>/gu;

function collectIDs(values: readonly string[]): string[] {
  return values.flatMap((value) =>
    [...value.matchAll(idPattern)].map((match) => match.groups?.['id'] ?? ''),
  );
}
