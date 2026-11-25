import type { BodyFields } from '@heynixie/policy';
import type { GmailCard } from './gmail-card';
import { gmailToolNames } from './gmail-tool-names';

// The card of a send, from the facts that `prepare` read: its sentence and approve button by the
// table of cards, and a field for the account, each recipient, the subject, the message answered, the
// text and the files. An empty field leaves the card.
export function buildGmailSendFields(tool: string, card: GmailCard): BodyFields {
  const everyone = [card['to'], card['cc'], card['bcc']].filter(
    (list): list is string => list !== undefined && list !== '',
  );

  const fields = Object.fromEntries(
    [
      ['from', card['from']],
      ['to', card['to']],
      ['cc', card['cc']],
      ['bcc', card['bcc']],
      ['subject', card['subject']],
      ['inReplyTo', card['inReplyTo']],
      ['text', card['text']],
      ['files', card['files']],
    ].filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== ''),
  );

  const from = card['from'] ?? '';
  const subject = card['subject'] ?? '';

  if (tool === gmailToolNames.reply) {
    return {
      status: 'fields',
      fields,
      sentence: `Reply to ${card['replyTo'] ?? ''} from ${from}: "${subject}"`,
      approveLabel: 'Send reply',
    };
  }

  return {
    status: 'fields',
    fields,
    sentence:
      tool === gmailToolNames.sendDraft
        ? `Send a draft from ${from} to ${everyone.join(', ')}: "${subject}"`
        : `Send an email from ${from} to ${everyone.join(', ')}: "${subject}"`,
    approveLabel: 'Send email',
  };
}
