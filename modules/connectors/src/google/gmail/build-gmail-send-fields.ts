import type { DestinationPermission } from '@heynixie/log';
import type { BodyFields } from '@heynixie/policy';
import type { GmailCard } from './gmail-card';
import { gmailToolNames } from './gmail-tool-names';

// The card of a send, from the facts that `prepare` read: its sentence, approve button and fields,
// with each recipient beside the permission the decision gave it, or "no permission". An empty
// field leaves the card.
export function buildGmailSendFields(
  tool: string,
  card: GmailCard,
  permissions: ReadonlyMap<string, DestinationPermission | null>,
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

const permissionWords: Readonly<Record<DestinationPermission, string>> = {
  owner: 'you',
  reply_target: 'reply target',
  known_contact: 'known contact',
  task: 'task',
  rule: 'allow rule',
};

function annotateRecipients(
  list: string | undefined,
  permissions: ReadonlyMap<string, DestinationPermission | null>,
): string | undefined {
  if (list === undefined || list === '') {
    return list;
  }

  return list
    .split(', ')
    .map((address) => {
      const permission = permissions.get(address);

      if (permission === undefined) {
        return address;
      }

      return `${address} (${permission === null ? 'no permission' : permissionWords[permission]})`;
    })
    .join(', ');
}
