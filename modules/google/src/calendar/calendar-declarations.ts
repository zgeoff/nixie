import type { ToolDefinition } from '@heynixie/tools';

type Declaration = ToolDefinition['declaration'];

// The effect declaration of each Calendar tool. A field that holds someone else's words is outside
// content. A tool whose destinations come from an event reads them in `prepare`, so its declaration
// lists none.
export const calendarDeclarations = {
  listCalendars: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: { calendars: 'untrusted', next: 'owner_data' },
  },
  listEvents: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: { events: 'untrusted', next: 'owner_data' },
  },
  readEvent: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: {
      event: 'owner_data',
      title: 'untrusted',
      location: 'untrusted',
      description: 'untrusted',
      organizer: 'untrusted',
      guests: 'untrusted',
      start: 'untrusted',
      end: 'untrusted',
      isAllDay: 'untrusted',
      status: 'untrusted',
      yourResponse: 'untrusted',
    },
  },
  createEvent: {
    effects: ['write'],
    destinations: [],
    amount: null,
    content: ['title', 'description'],
    results: { event: 'owner_data', link: 'owner_data' },
  },
  createEventWithGuests: {
    effects: ['send'],
    destinations: ['guests'],
    amount: null,
    content: ['title', 'description'],
    results: { event: 'owner_data', link: 'owner_data' },
  },
  changeEvent: {
    effects: ['write'],
    destinations: [],
    amount: null,
    content: ['title', 'description'],
    results: { event: 'owner_data', link: 'owner_data' },
  },
  changeEventWithGuests: {
    effects: ['send'],
    destinations: [],
    amount: null,
    content: ['title', 'description'],
    results: { event: 'owner_data', link: 'owner_data' },
  },
  cancelEvent: {
    effects: ['write'],
    destinations: [],
    amount: null,
    content: [],
    results: { event: 'owner_data' },
  },
  cancelEventWithGuests: {
    effects: ['send'],
    destinations: [],
    amount: null,
    content: [],
    results: { event: 'owner_data' },
  },
  respond: {
    effects: ['send'],
    destinations: [],
    amount: null,
    content: [],
    results: { event: 'owner_data' },
  },
} as const satisfies Readonly<Record<string, Declaration>>;
