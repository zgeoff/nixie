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
import { parseEventRef } from './parse-event-ref';
import { pickEventRefusal } from './pick-event-refusal';
import { readCalendarEvent } from './read-calendar-event';

// calendar.cancel_event and calendar.cancel_event_with_guests: cancels an event that the account
// organizes, queued. The tool without guests refuses an event that has a guest. The tool with guests
// emails each guest, and its destinations are the guests, read in `prepare`.
export function buildCalendarCancelTool(deps: GoogleDeps, withGuests: boolean): ToolDefinition {
  const name = withGuests ? calendarToolNames.cancelEventWithGuests : calendarToolNames.cancelEvent;

  return {
    name,
    description: withGuests
      ? 'Cancels an event that you organize on a connected Google account, and emails each guest ' +
        "the cancellation. The call is queued under your rules, and returns the action's ID."
      : 'Cancels an event with no guests that you organize on a connected Google account, and ' +
        'emails no one. For an event with guests, use calendar.cancel_event_with_guests. The call ' +
        "is queued, and returns the action's ID.",
    input: {
      type: 'object',
      properties: { event: { type: 'string' }, connection: { type: 'string' } },
      required: ['event'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { event: { type: 'string' } },
      required: ['event'],
      additionalProperties: false,
    },
    declaration: withGuests
      ? calendarDeclarations.cancelEventWithGuests
      : calendarDeclarations.cancelEvent,
    execution: 'queued',
    resolveInput: makeResolveGoogleInput(deps.access, ['event']),
    prepare: async (input): Promise<Prepared | PrepareRefusal> => {
      const parsed = calendarArgumentsSchema.cancel.safeParse(input);

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
          : buildFailureRefusal(read.failure, deps.clock);
      }

      const refusal = pickEventRefusal(read.event, { withGuests, addGuests: [], removeGuests: [] });

      if (refusal !== null) {
        return { status: 'error', message: refusal.message };
      }

      return {
        destinations: withGuests ? collectEventDestinations(read.event, []) : [],
        attachments: [buildCardAttachment(buildEventCard(read.event, {}))],
      };
    },
    run: () => Promise.resolve({ status: 'error', message: `${name} runs only queued` }),
  };
}
