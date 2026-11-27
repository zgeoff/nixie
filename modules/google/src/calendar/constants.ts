export const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

export const dateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u;

// the calendar a tool reaches when the call names none
export const primaryCalendar = 'primary';
const responseValues = ['accepted', 'declined', 'tentative', 'needsAction'];

// The properties of an event in a tool's output schema. The fields that cannot carry words are
// endorsed.
export const eventOutputProperties = {
  event: { type: 'string' },
  title: { type: 'string' },
  start: { type: ['string', 'null'], 'x-endorsed': true },
  end: { type: ['string', 'null'], 'x-endorsed': true },
  isAllDay: { type: 'boolean', 'x-endorsed': true },
  location: { type: ['string', 'null'] },
  organizer: { type: ['string', 'null'] },
  guests: { type: 'array', items: { type: 'string' } },
  yourResponse: { type: ['string', 'null'], enum: [...responseValues, null], 'x-endorsed': true },
  status: { type: 'string', enum: ['confirmed', 'tentative', 'cancelled'], 'x-endorsed': true },
} as const;

export const eventOutputRequired = [
  'event',
  'title',
  'start',
  'end',
  'isAllDay',
  'location',
  'organizer',
  'guests',
  'yourResponse',
  'status',
] as const;

// an email address as a guest: no space, comma, semicolon or angle bracket
export const guestAddressPattern = String.raw`^[^\s@,;<>]+@[^\s@,;<>]+$`;
