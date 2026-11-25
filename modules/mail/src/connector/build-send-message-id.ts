import type { MailSettings } from '../types';

// The Message-ID of a send, without angle brackets: the action's ID at the assistant's domain. A
// retry and a reconcile of the action build the same one, so the host finds the send by it.
export function buildSendMessageID(
  settings: Pick<MailSettings, 'address'>,
  actionID: string,
): string {
  const domain = settings.address.slice(settings.address.lastIndexOf('@') + 1);

  return `${actionID}@${domain}`;
}
