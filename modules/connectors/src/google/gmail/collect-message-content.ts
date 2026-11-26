import type { GmailAttachment, GmailMessage, GmailPart } from './types';

export interface MessageContent {
  // the first plain-text and HTML body parts that are no attachment
  readonly textPart: GmailPart | null;
  readonly htmlPart: GmailPart | null;
  readonly attachments: readonly GmailAttachment[];

  // the part of each attachment by its ID
  readonly attachmentParts: ReadonlyMap<string, GmailPart>;
}

interface ContentState {
  textPart: GmailPart | null;
  htmlPart: GmailPart | null;
  attachments: GmailAttachment[];
  attachmentParts: Map<string, GmailPart>;
}

// Walks the parts of a message once: its bodies, and each file it carries.
export function collectMessageContent(message: GmailMessage): MessageContent {
  const state: ContentState = {
    textPart: null,
    htmlPart: null,
    attachments: [],
    attachmentParts: new Map(),
  };

  walk(message.payload, state);

  return state;
}

function walk(part: GmailPart, state: ContentState): void {
  if (part.mimeType.startsWith('multipart/')) {
    for (const child of part.parts) {
      walk(child, state);
    }

    return;
  }

  if (part.filename === '' && part.mimeType === 'text/plain') {
    state.textPart ??= part;

    return;
  }

  if (part.filename === '' && part.mimeType === 'text/html') {
    state.htmlPart ??= part;

    return;
  }

  if (part.filename !== '' || part.attachmentID !== null) {
    state.attachments.push({
      attachment: part.partID,
      name: part.filename === '' ? `part-${part.partID}` : part.filename,
      type: part.mimeType,
      bytes: part.size,
    });

    state.attachmentParts.set(part.partID, part);
  }
}
