import type { WakeMatch } from '../types';

export interface MatchedMail {
  readonly from: string;
  readonly subject: string;
  readonly threadID: string;
}

// Every field of the match that is present must match. The From header proves nothing about the
// sender, so a `from` match is a filter and never a check of trust.
export function isWakeMatch(match: WakeMatch, mail: MatchedMail): boolean {
  if (match.from !== undefined && !match.from.some((entry) => isFromEntry(entry, mail.from))) {
    return false;
  }

  if (match.subject !== undefined && !normalize(mail.subject).includes(normalize(match.subject))) {
    return false;
  }

  return match.thread === undefined || match.thread === mail.threadID;
}

function isFromEntry(entry: string, from: string): boolean {
  const wanted = normalize(entry);
  const address = normalize(from);

  if (wanted.startsWith('@')) {
    return address.slice(address.lastIndexOf('@')) === wanted;
  }

  return address === wanted;
}

function normalize(text: string): string {
  return text.normalize('NFC').toLowerCase();
}
