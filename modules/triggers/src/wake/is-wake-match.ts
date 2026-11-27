import type { WakeMatch } from '../types';

export interface MatchedMail {
  readonly from: string;
  readonly subject: string;
  readonly threadID: string;

  // a text's body, which marks the arrival as a text; a mail has none
  readonly body?: string;
}

// Every field of the match that is present must match. The From header proves nothing about the
// sender, so a `from` match is a filter and never a check of trust. A mail's sender may match a
// whole domain, a text's sender only matches whole, and only a text has a body to match.
export function isWakeMatch(match: WakeMatch, mail: MatchedMail): boolean {
  const isText = mail.body !== undefined;

  if (match.body !== undefined && !isText) {
    return false;
  }

  const isSender = isText ? isTextSender : isFromEntry;

  if (match.from !== undefined && !match.from.some((entry) => isSender(entry, mail.from))) {
    return false;
  }

  if (match.subject !== undefined && !normalize(mail.subject).includes(normalize(match.subject))) {
    return false;
  }

  if (match.body !== undefined && !normalize(mail.body ?? '').includes(normalize(match.body))) {
    return false;
  }

  return match.thread === undefined || match.thread === mail.threadID;
}

function isTextSender(entry: string, from: string): boolean {
  return normalize(entry) === normalize(from);
}

function normalize(text: string): string {
  return text.normalize('NFC').toLowerCase();
}

function isFromEntry(entry: string, from: string): boolean {
  const wanted = normalize(entry);
  const address = normalize(from);

  if (wanted.startsWith('@')) {
    return address.slice(address.lastIndexOf('@')) === wanted;
  }

  return address === wanted;
}
