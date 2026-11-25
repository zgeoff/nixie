import { buildMailConnectors } from '@heynixie/mail';
import type { MailToolContext } from '@heynixie/mail';
import type { ActionsWithCoding } from '../coding/add-coding-connectors';
import type { ServerMail } from './build-server-mail';

// The mail connectors need the host, so the part adds them after the queue is built. The send and
// the reply sit in the model's tool list, so they add no queued tool. Without a mailbox, the
// actions gain nothing.
export function addMailConnectors(
  actions: ActionsWithCoding,
  mail: ServerMail | null,
  context: MailToolContext | null,
): ActionsWithCoding {
  if (mail === null || context === null) {
    return actions;
  }

  return {
    ...actions,
    connectors: new Map([...actions.connectors, ...buildMailConnectors(context, mail.host)]),
  };
}
