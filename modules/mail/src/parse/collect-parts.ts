import type { MailAttachment } from '../types';
import { cleanAttachmentName } from './clean-attachment-name';
import { decodeBodyBytes } from './decode-body-bytes';
import { decodeBodyText } from './decode-body-text';
import { decodeHeaderWords } from './decode-header-words';
import { parseContentType } from './parse-content-type';
import { parseHeaders } from './parse-headers';
import { splitMessage } from './split-message';

export interface PartAttachment extends MailAttachment {
  readonly content: Uint8Array<ArrayBuffer>;
}

export interface MailParts {
  readonly texts: readonly string[];

  // the HTML of each HTML part as it came, which the fetch sandbox reads
  readonly htmls: readonly string[];
  readonly attachments: readonly PartAttachment[];
}

// Walks a message or a part of one, and gathers its plain texts, its HTML texts and its
// attachments. The input is the latin1 reading of the raw bytes.
export function collectParts(raw: string): MailParts {
  const split = splitMessage(raw);
  const headers = parseHeaders(split.head);
  const contentType = parseContentType(headers.get('content-type')?.[0]);
  const boundary = contentType.parameters.get('boundary');

  if (contentType.type.startsWith('multipart/') && boundary !== undefined) {
    return collectMultipart(split.body, boundary);
  }

  const disposition = parseContentType(headers.get('content-disposition')?.[0]);
  const name = disposition.parameters.get('filename') ?? contentType.parameters.get('name') ?? null;
  const encoding = headers.get('content-transfer-encoding')?.[0] ?? '7bit';

  if (name !== null || disposition.type === 'attachment') {
    const content = new Uint8Array(decodeBodyBytes(split.body, encoding));

    return {
      texts: [],
      htmls: [],
      attachments: [
        {
          name: cleanAttachmentName(decodeHeaderWords(name ?? '')),
          bytes: content.byteLength,
          content,
        },
      ],
    };
  }

  const charset = contentType.parameters.get('charset') ?? 'utf8';
  const text = decodeBodyText(split.body, encoding, charset);

  if (contentType.type === 'text/html') {
    return { texts: [], htmls: [text], attachments: [] };
  }

  return {
    texts: contentType.type === '' || contentType.type === 'text/plain' ? [text] : [],
    htmls: [],
    attachments: [],
  };
}

function collectMultipart(body: string, boundary: string): MailParts {
  const escaped = boundary.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

  // the capture holds the closing mark of a boundary line, so the text after the closing boundary,
  // which is no part, is told apart from a part
  const pieces = body.split(new RegExp(`(?:^|\\r?\\n)--${escaped}(--)?[ \\t]*(?:\\r?\\n|$)`, 'u'));
  const texts: string[] = [];
  const htmls: string[] = [];
  const attachments: PartAttachment[] = [];

  // the first piece is the preamble, and each boundary line gives a closing mark and a piece
  for (let index = 1; index < pieces.length; index += 2) {
    if (pieces[index] === '--') {
      break;
    }

    const part = collectParts(pieces[index + 1] ?? '');

    texts.push(...part.texts);
    htmls.push(...part.htmls);
    attachments.push(...part.attachments);
  }

  return { texts, htmls, attachments };
}
