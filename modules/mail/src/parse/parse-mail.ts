import { maxFetchHTMLChars } from '@heynixie/wire';
import type { ParsedMail } from '../types';
import { collectAddresses } from './collect-addresses';
import { collectParts } from './collect-parts';
import { decodeHeaderWords } from './decode-header-words';
import { parseHeaders } from './parse-headers';
import { splitMessage } from './split-message';

// Reads a raw RFC 5322 message. Only the mail module reads mail, and every text it returns came from
// outside nixie. A mail keeps its plain text and its HTML as they came, and the fetch sandbox reads
// the HTML when the assistant opens the mail, which is where the links of the HTML get their IDs.
export function parseMail(raw: Uint8Array): ParsedMail {
  const latin1 = Buffer.from(raw).toString('latin1');
  const split = splitMessage(latin1);

  // an 8-bit header holds UTF-8 bytes, which the latin1 reading splits
  const headers = parseHeaders(Buffer.from(split.head, 'latin1').toString('utf8'));
  const parts = collectParts(latin1);
  const plain = parts.texts.filter((part) => part.trim() !== '');
  const html = parts.htmls.join('\n').trim();
  const answered = [...(headers.get('in-reply-to') ?? []), ...(headers.get('references') ?? [])];

  return {
    messageID: collectIDs(headers.get('message-id') ?? [])[0] ?? null,
    references: collectIDs(answered),
    from: collectAddresses(headers.get('from') ?? [])[0] ?? '',
    to: collectAddresses(headers.get('to') ?? []),
    cc: collectAddresses(headers.get('cc') ?? []),
    subject: decodeHeaderWords(headers.get('subject')?.[0] ?? ''),
    text: plain.join('\n').trim(),
    html: html.slice(0, maxFetchHTMLChars),
    attachments: parts.attachments.map((attachment) => ({
      name: attachment.name,
      bytes: attachment.bytes,
    })),
    attachmentContents: parts.attachments.map((attachment) => attachment.content),
  };
}

const idPattern = /<(?<id>[^<>\s]+)>/gu;

function collectIDs(values: readonly string[]): string[] {
  return values.flatMap((value) =>
    [...value.matchAll(idPattern)].map((match) => match.groups?.['id'] ?? ''),
  );
}
