// The Message-ID of a send, without angle brackets: the action's ID at the sender's domain. A retry
// and a reconcile of the action build the same one, so the Sent-folder check finds the send by it.
export function buildSendMessageID(account: string, actionID: string): string {
  const domain = account.slice(account.lastIndexOf('@') + 1);

  return `${actionID}@${domain}`;
}
