import type { StoredDestinationPermission } from '@heynixie/log';
import type { BodyFields } from '@heynixie/policy';
import { annotateRecipients } from './annotate-recipients';
import type { GmailCard } from './gmail-card';
import { gmailToolNames } from './gmail-tool-names';

// The card of a send, from the facts that `prepare` read: its sentence, approve button and fields,
// with each recipient beside the permission the decision gave it, or "no permission". An empty
// field leaves the card.
export function buildGmailSendFields(
  tool: string,
  card: GmailCard,
  permissions: ReadonlyMap<string, StoredDestinationPermission | null>,
): BodyFields {
  const everyone = [card['to'], card['cc'], card['bcc']].filter(
    (list): list is string => list !== undefined && list !== '',
  );

  const fields = Object.fromEntries(
    [
      ['from', card['from']],
      ['to', annotateRecipients(card['to'], permissions)],
      ['cc', annotateRecipients(card['cc'], permissions)],
      ['bcc', annotateRecipients(card['bcc'], permissions)],
      ['subject', card['subject']],
      ['inReplyTo', card['inReplyTo']],
      ['text', card['text']],
      ['files', card['files']],
      ['replyWake', card['replyWake']],
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
