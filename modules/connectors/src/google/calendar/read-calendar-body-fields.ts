import type { JSONObject, Log } from '@heynixie/log';
import { readRecordAttachments } from '@heynixie/log';
import type { BodyFields, BodyFieldsRequest } from '@heynixie/policy';
import { readMessageTimeZone } from '../../time/read-message-time-zone';
import type { GmailCard } from '../gmail/gmail-card';
import { joinCardList, parseCardAttachment } from '../gmail/gmail-card';
import { readDestinationPermissions } from '../gmail/read-destination-permissions';
import { buildCalendarFields } from './build-calendar-fields';
import { calendarToolNames } from './calendar-tool-names';
import { primaryCalendar } from './constants';

const attachedTools: ReadonlySet<string> = new Set([
  calendarToolNames.changeEvent,
  calendarToolNames.changeEventWithGuests,
  calendarToolNames.cancelEvent,
  calendarToolNames.cancelEventWithGuests,
  calendarToolNames.respond,
]);

// The extra card fields of a Calendar call: the facts that `prepare` sealed with the call, or for
// a create the call's input. An erased attachment reads as unreadable. Times show in the zone of
// the owner's newest message, else the default zone.
export async function readCalendarBodyFields(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: BodyFieldsRequest,
  defaultZone: string,
): Promise<BodyFields> {
  const isCreate =
    request.tool === calendarToolNames.createEvent ||
    request.tool === calendarToolNames.createEventWithGuests;

  if (!isCreate && !attachedTools.has(request.tool)) {
    return { status: 'none' };
  }

  const messageZone = await readMessageTimeZone(log, request.callSequence);

  const zone = messageZone ?? defaultZone;

  const permissions = await readDestinationPermissions(log, request.callSequence);

  if (isCreate) {
    return buildCalendarFields(request.tool, buildCreateCard(request.input), { zone, permissions });
  }

  const attachments = await readRecordAttachments(log, [request.callSequence]);

  const stored = attachments.get(request.callSequence);
  const bytes = stored?.status === 'readable' ? stored.attachments[0] : undefined;
  const card = bytes === undefined ? null : parseCardAttachment(bytes);

  return card === null
    ? { status: 'unreadable' }
    : buildCalendarFields(request.tool, card, { zone, permissions });
}

function buildCreateCard(input: JSONObject): GmailCard {
  const text = (key: string): string => {
    const value = input[key];

    return typeof value === 'string' ? value : '';
  };

  const guests = Array.isArray(input['guests'])
    ? input['guests'].filter((guest): guest is string => typeof guest === 'string')
    : [];

  return {
    title: text('title'),
    start: text('start'),
    end: text('end'),
    calendar: text('calendar') === '' ? primaryCalendar : text('calendar'),
    location: text('location'),
    guests: joinCardList(guests),
  };
}
