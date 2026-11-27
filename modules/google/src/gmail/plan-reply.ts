import { collectAddresses } from './collect-addresses';
import { decodeHeaderWords } from './decode-header-words';
import { stripAngleBrackets } from './strip-angle-brackets';
import type { GmailMessage } from './types';

export interface ReplyPlan {
  readonly to: readonly string[];
  readonly cc: readonly string[];

  // every recipient, which the decision point checks as a destination
  readonly destinations: readonly string[];

  // the recipients that the message itself named as its sender: at most the one address of From
  readonly replyTargets: readonly string[];
  readonly subject: string;

  // the Message-ID header of the message answered, without angle brackets
  readonly inReplyTo: string | null;
  readonly references: readonly string[];

  // who wrote the message, as the card shows it
  readonly sender: string;
}

// Where a reply goes, from the message and never from the model: Reply-To, else From, and with
// `isReplyAll` the To and Cc too, without the account's own address. A reply to the account's own
// message goes to its To. The sender is a reply target unless the message sits in Spam or Trash.
export function planReply(message: GmailMessage, account: string, isReplyAll: boolean): ReplyPlan {
  const headers = message.payload.headers;
  const own = account.normalize('NFC').toLowerCase();
  const [from = ''] = collectAddresses(headers.get('from'));
  const [replyTo] = collectAddresses(headers.get('reply-to'));
  const sentToMe = collectAddresses(headers.get('to'));
  const copied = collectAddresses(headers.get('cc'));
  const isOwn = from === own;
  const primary = isOwn ? sentToMe : [replyTo ?? from];
  const others = isOwn ? copied : [...sentToMe, ...copied];
  const to = primary.filter((address) => address !== '' && address !== own);

  const cc = isReplyAll
    ? [...new Set(others)].filter((address) => address !== own && !to.includes(address))
    : [];

  const destinations = [...to, ...cc];
  const isAllowed = !isOwn && !message.labels.includes('SPAM') && !message.labels.includes('TRASH');
  const messageID = stripAngleBrackets(headers.get('message-id'));
  const subject = decodeHeaderWords(headers.get('subject') ?? '');

  return {
    to,
    cc,
    destinations,
    replyTargets: isAllowed && destinations.includes(from) ? [from] : [],
    subject: /^re:/iu.test(subject) ? subject : `Re: ${subject}`,
    inReplyTo: messageID,
    references: [
      ...(headers.get('references') ?? '')
        .split(/\s+/u)
        .map((id) => stripAngleBrackets(id))
        .filter((id): id is string => id !== null),
      ...(messageID === null ? [] : [messageID]),
    ],
    sender: decodeHeaderWords(headers.get('from') ?? from),
  };
}
