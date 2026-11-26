import { z } from 'zod';
import { normalizeAddress } from './normalize-address';
import type { CalendarEvent, EventGuest, EventResponse, EventStatus } from './types';

const timeSchema = z.object({
  date: z.string().exactOptional(),
  dateTime: z.string().exactOptional(),
});

const attendeeSchema = z.object({
  email: z.string().exactOptional(),
  self: z.boolean().exactOptional(),
  responseStatus: z.string().exactOptional(),
  resource: z.boolean().exactOptional(),
  optional: z.boolean().exactOptional(),
  organizer: z.boolean().exactOptional(),
  displayName: z.string().exactOptional(),
  id: z.string().exactOptional(),
  comment: z.string().exactOptional(),
  additionalGuests: z.number().exactOptional(),
});

const organizerSchema = z.object({
  email: z.string().exactOptional(),
  self: z.boolean().exactOptional(),
});

const propertiesSchema = z.record(z.string(), z.string());
const extendedSchema = z.object({ private: propertiesSchema.exactOptional() });

const eventSchema = z.object({
  id: z.string(),
  etag: z.string().exactOptional(),
  status: z.string().exactOptional(),
  summary: z.string().exactOptional(),
  location: z.string().exactOptional(),
  description: z.string().exactOptional(),
  htmlLink: z.string().exactOptional(),
  start: timeSchema.exactOptional(),
  end: timeSchema.exactOptional(),
  organizer: organizerSchema.exactOptional(),
  attendees: z.array(attendeeSchema).exactOptional(),
  extendedProperties: extendedSchema.exactOptional(),
});

export const eventListSchema = z.object({
  items: z.array(z.unknown()).exactOptional(),
  nextPageToken: z.string().exactOptional(),
});

interface EventSource {
  readonly calendar: string;

  // the connection's account, whose own attendee entry is no guest
  readonly account: string;
}

// An event from Google's answer, for the calendar and account that read it. Null for an answer that
// holds no event.
export function parseCalendarEvent(body: unknown, source: EventSource): CalendarEvent | null {
  const parsed = eventSchema.safeParse(body);

  if (!parsed.success) {
    return null;
  }

  const event = parsed.data;
  const account = normalizeAddress(source.account);
  const attendees = event.attendees ?? [];
  const organizerEmail = event.organizer?.email;
  const organizer = organizerEmail === undefined ? null : normalizeAddress(organizerEmail);

  const guests: EventGuest[] = attendees.flatMap((attendee) => {
    const address = attendee.email === undefined ? '' : normalizeAddress(attendee.email);

    return address === '' || attendee.self === true || address === account
      ? []
      : [{ address, response: pickResponse(attendee.responseStatus) }];
  });

  const own = attendees.find(
    (attendee) =>
      attendee.self === true ||
      (attendee.email !== undefined && normalizeAddress(attendee.email) === account),
  );

  return {
    id: event.id,
    calendar: source.calendar,
    etag: event.etag ?? '',
    status: pickStatus(event.status),
    title: event.summary ?? '',
    location: event.location ?? '',
    description: event.description ?? '',
    start: event.start?.dateTime ?? event.start?.date ?? '',
    end: event.end?.dateTime ?? event.end?.date ?? '',
    isAllDay: event.start?.date !== undefined && event.start.dateTime === undefined,
    link: event.htmlLink ?? null,
    organizer,
    isOrganizedByAccount: organizer !== null && organizer === account,
    guests,
    attendees: attendees.flatMap((attendee) =>
      attendee.email === undefined ? [] : [{ ...attendee, email: attendee.email }],
    ),
    yourResponse: own === undefined ? null : pickResponse(own.responseStatus),
    privateProperties: event.extendedProperties?.private ?? {},
  };
}

function pickResponse(status: string | undefined): EventResponse | null {
  return status === 'accepted' ||
    status === 'declined' ||
    status === 'tentative' ||
    status === 'needsAction'
    ? status
    : null;
}

function pickStatus(status: string | undefined): EventStatus {
  return status === 'cancelled' || status === 'tentative' ? status : 'confirmed';
}
