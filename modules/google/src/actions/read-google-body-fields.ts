import type { Log } from '@heynixie/log';
import type { BodyFields, BodyFieldsRequest } from '@heynixie/policy';
import { readCalendarBodyFields } from '../calendar/read-calendar-body-fields';
import { readDriveBodyFields } from '../drive/read-drive-body-fields';
import { readGmailBodyFields } from '../gmail/read-gmail-body-fields';
import type { GoogleToolkit } from '../gmail/types';

// The extra card fields of a Google call, from the tool that owns it: the Gmail, Calendar or Drive
// tool. A call of none of them answers none. Calendar times show in the owner's zone, else the
// default zone.
export async function readGoogleBodyFields(
  toolkit: Pick<GoogleToolkit, 'readMessageTimeZone'>,
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: BodyFieldsRequest,
  defaultZone: string,
): Promise<BodyFields> {
  const gmail = await readGmailBodyFields(log, request);

  if (gmail.status !== 'none') {
    return gmail;
  }

  const calendar = await readCalendarBodyFields(toolkit, log, request, defaultZone);

  return calendar.status === 'none' ? readDriveBodyFields(log, request) : calendar;
}
