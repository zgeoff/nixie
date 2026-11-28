import type { PrepareRefusal, Prepared, ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildFailureRefusal, forgottenOutcome } from '../call/build-google-failure';
import { makeResolveGoogleInput } from '../call/make-resolve-google-input';
import { buildCardAttachment } from '../gmail/gmail-card';
import { readCallContext } from '../gmail/read-call-context';
import type { GoogleDeps } from '../types';
import { buildEventCard } from './build-event-card';
import { calendarArgumentsSchema } from './calendar-arguments-schema';
import { calendarDeclarations } from './calendar-declarations';
import { calendarToolNames } from './calendar-tool-names';
import { collectEventDestinations } from './collect-event-destinations';
import { collectOtherAddresses } from './collect-other-addresses';
import { guestAddressPattern } from './constants';
import { parseEventRef } from './parse-event-ref';
import { pickEventRefusal } from './pick-event-refusal';
import { readCalendarEvent } from './read-calendar-event';

const timeProperty = {
  type: ['string', 'null'],
  description:
    'RFC 3339 time with an offset, or a date for an all-day event; null leaves it as it is. ' +
    'start and end change together',
} as const;

const guestList = {
  type: 'array',
  items: { type: 'string', pattern: guestAddressPattern },
  maxItems: 100,
} as const;

// calendar.change_event and calendar.change_event_with_guests: changes an event that the account
// organizes, queued. A field that is null or absent stays as it is. The tool with guests emails each
// guest and reads its destinations in `prepare`: each guest before the change and each it adds.
export function buildCalendarChangeTool(deps: GoogleDeps, withGuests: boolean): ToolDefinition {
  const name = withGuests ? calendarToolNames.changeEventWithGuests : calendarToolNames.changeEvent;

  return {
    name,
    description: withGuests
      ? 'Changes an event that you organize on a connected Google account, and emails each guest ' +
        'the change. A field left out or null stays as it is. addGuests and removeGuests change ' +
        "the guest list. The call is queued under your rules, and returns the action's ID."
      : 'Changes an event with no guests that you organize on a connected Google account, and ' +
        'emails no one. A field left out or null stays as it is. For an event with guests, use ' +
        "calendar.change_event_with_guests. The call is queued, and returns the action's ID.",
    input: {
      type: 'object',
      properties: {
        event: { type: 'string' },
        title: { type: ['string', 'null'], maxLength: 1000 },
        start: timeProperty,
        end: timeProperty,
        location: { type: ['string', 'null'], maxLength: 1000 },
        description: { type: ['string', 'null'], maxLength: 20_000 },
        ...(withGuests ? { addGuests: guestList, removeGuests: guestList } : {}),
        connection: { type: 'string' },
      },
      required: ['event'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { event: { type: 'string' }, link: { type: ['string', 'null'] } },
      required: ['event', 'link'],
      additionalProperties: false,
    },
    declaration: withGuests
      ? calendarDeclarations.changeEventWithGuests
      : calendarDeclarations.changeEvent,
    execution: 'queued',
    resolveInput: makeResolveGoogleInput(deps.access, ['event']),
    prepare: async (input): Promise<Prepared | PrepareRefusal> => {
      const parsed = calendarArgumentsSchema.change.safeParse(input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const context = await readCallContext(deps.access, input);

      const ref = parseEventRef(parsed.data.event);

      if (context === null || ref === null) {
        return forgottenOutcome;
      }

      const read = await readCalendarEvent(deps.hosts, context, ref);

      if (read.kind !== 'event') {
        return read.kind === 'missing'
          ? { status: 'error', message: `UNKNOWN_EVENT: no event has the ID ${parsed.data.event}` }
          : buildFailureRefusal(read.failure);
      }

      const args = parsed.data;
      const addGuests = collectOtherAddresses(args.addGuests ?? [], context.account);
      const removeGuests = args.removeGuests ?? [];
      const refusal = pickEventRefusal(read.event, { withGuests, addGuests, removeGuests });

      if (refusal !== null) {
        return { status: 'error', message: refusal.message };
      }

      const isChange = [args.title, args.start, args.location, args.description].some(
        (value) => value !== undefined && value !== null,
      );

      if (!isChange && addGuests.length === 0 && removeGuests.length === 0) {
        return { status: 'error', message: 'NOTHING_TO_CHANGE: the call changes no field' };
      }

      return {
        destinations: withGuests ? collectEventDestinations(read.event, addGuests) : [],
        attachments: [
          buildCardAttachment(
            buildEventCard(read.event, {
              ...(args.title === null || args.title === undefined
                ? {}
                : { titleAfter: args.title }),
              ...(args.start === null || args.start === undefined
                ? {}
                : { startAfter: args.start }),
              ...(args.end === null || args.end === undefined ? {} : { endAfter: args.end }),
              ...(args.location === null || args.location === undefined
                ? {}
                : { locationAfter: args.location }),
              ...(args.description === null || args.description === undefined
                ? {}
                : { descriptionAfter: args.description }),
              addGuests,
              removeGuests,
            }),
          ),
        ],
      };
    },
    run: () => Promise.resolve({ status: 'error', message: `${name} runs only queued` }),
  };
}
