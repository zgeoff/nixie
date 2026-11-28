import { connectionStatusText } from './connection-status-text';
import { fillStatusText } from './fill-status-text';

// The account of a connection as the line shows it: in brackets after the label, or nothing when the
// connection's account holds no address.
export function renderConnectionAccount(account: string): string {
  return account === '' ? '' : fillStatusText(connectionStatusText.accountPart, { account });
}
