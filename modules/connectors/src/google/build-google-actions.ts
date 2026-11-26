import type { ConnectorAction } from '../types';
import { buildCalendarActions } from './calendar/build-calendar-actions';
import { buildDriveActions } from './drive/build-drive-actions';
import { buildGmailActions } from './gmail/build-gmail-actions';
import type { GmailDeps } from './gmail/types';

// Every tool of the Google connector: the Gmail, Calendar and Drive tools.
export function buildGoogleActions(deps: GmailDeps): ConnectorAction[] {
  return [...buildGmailActions(deps), ...buildCalendarActions(deps), ...buildDriveActions(deps)];
}
