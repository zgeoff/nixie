import type { ToolDefinition } from '@heynixie/tools';
import { makeResolveGoogleInput } from '../make-resolve-google-input';
import type { GoogleDeps } from '../types';
import { calendarDeclarations } from './calendar-declarations';
import { calendarToolNames } from './calendar-tool-names';
import { guestAddressPattern } from './constants';
import { makeResolveCreateInput } from './make-resolve-create-input';

const timeProperty = {
  type: 'string',
  description: 'RFC 3339 time with an offset, or a date such as 2026-11-18 for an all-day event',
} as const;

// calendar.create_event and calendar.create_event_with_guests: one new event, queued. The tool
// without guests has no guest argument and emails no one. The tool with guests invites each guest,
// is a send, and takes its `guests` as its destinations.
export function buildCalendarCreateTool(deps: GoogleDeps, withGuests: boolean): ToolDefinition {
  return {
    name: withGuests ? calendarToolNames.createEventWithGuests : calendarToolNames.createEvent,
    description: withGuests
      ? 'Creates an event on a calendar of a connected Google account and emails an invitation to ' +
        "each guest. The call is queued under your rules, and returns the action's ID. Once it " +
        'runs, its outcome holds the event.'
      : 'Creates an event with no guests on a calendar of a connected Google account, and emails ' +
        'no one. For an event with guests, use calendar.create_event_with_guests. The call is ' +
        "queued, and returns the action's ID. Once it runs, its outcome holds the event.",
    input: {
      type: 'object',
      properties: {
        calendar: { type: 'string', description: 'a calendar ID; primary by default' },
        title: { type: 'string', minLength: 1, maxLength: 1000 },
        start: timeProperty,
        end: timeProperty,
        location: { type: 'string', maxLength: 1000 },
        description: { type: 'string', maxLength: 20_000 },
        ...(withGuests
          ? {
              guests: {
                type: 'array',
                items: { type: 'string', pattern: guestAddressPattern },
                minItems: 1,
                maxItems: 100,
                description: 'the email address of each guest',
              },
            }
          : {}),
        connection: { type: 'string' },
      },
      required: ['title', 'start', 'end', ...(withGuests ? ['guests'] : [])],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { event: { type: 'string' }, link: { type: ['string', 'null'] } },
      required: ['event', 'link'],
      additionalProperties: false,
    },
    declaration: withGuests
      ? calendarDeclarations.createEventWithGuests
      : calendarDeclarations.createEvent,
    execution: 'queued',
    resolveInput: withGuests
      ? makeResolveCreateInput(deps)
      : makeResolveGoogleInput(deps.access, []),
    run: () =>
      Promise.resolve({
        status: 'error',
        message: `${withGuests ? calendarToolNames.createEventWithGuests : calendarToolNames.createEvent} runs only queued`,
      }),
  };
}
