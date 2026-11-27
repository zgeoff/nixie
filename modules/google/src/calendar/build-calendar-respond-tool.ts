import type { PrepareRefusal, Prepared, ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { makeResolveGoogleInput } from '../call/make-resolve-google-input';
import { buildCardAttachment } from '../gmail/gmail-card';
import { readCallContext } from '../gmail/read-call-context';
import type { GoogleDeps } from '../types';
import { buildEventCard } from './build-event-card';
import { calendarArgumentsSchema } from './calendar-arguments-schema';
import { calendarDeclarations } from './calendar-declarations';
import { calendarToolNames } from './calendar-tool-names';
import { parseEventRef } from './parse-event-ref';
import { readCalendarEvent } from './read-calendar-event';

// calendar.respond: answers an invitation as the connected account, queued. Google emails the
// organizer, so the call is a send whose destination is the organizer, read in `prepare`. The
// organizer is the reply target, because the answer replies to their invitation.
export function buildCalendarRespondTool(deps: GoogleDeps): ToolDefinition {
  return {
    name: calendarToolNames.respond,
    description:
      'Answers an invitation to an event as a connected Google account: accepted, declined or ' +
      'tentative. Google emails the organizer. The call is queued under your rules, and returns the ' +
      "action's ID.",
    input: {
      type: 'object',
      properties: {
        event: { type: 'string' },
        response: { type: 'string', enum: ['accepted', 'declined', 'tentative'] },
        connection: { type: 'string' },
      },
      required: ['event', 'response'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { event: { type: 'string' } },
      required: ['event'],
      additionalProperties: false,
    },
    declaration: calendarDeclarations.respond,
    execution: 'queued',
    resolveInput: makeResolveGoogleInput(deps.access, ['event']),
    prepare: async (input): Promise<Prepared | PrepareRefusal> => {
      const parsed = calendarArgumentsSchema.respond.safeParse(input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const context = await readCallContext(deps.access, input);

      const ref = parseEventRef(parsed.data.event);

      if (context === null || ref === null) {
        return { status: 'error', message: 'CONNECTION_FORGOTTEN: the connection was forgotten' };
      }

      const read = await readCalendarEvent(deps.hosts, context, ref);

      if (read.kind !== 'event') {
        return {
          status: 'error',
          message:
            read.kind === 'missing'
              ? `UNKNOWN_EVENT: no event has the ID ${parsed.data.event}`
              : `GOOGLE_FAILED: ${read.reason}`,
        };
      }

      if (read.event.yourResponse === null) {
        return {
          status: 'error',
          message: 'NOT_INVITED: the connected account is no guest of this event',
        };
      }

      if (read.event.organizer === null) {
        return {
          status: 'error',
          message: 'NO_ORGANIZER: the event names no organizer to answer',
        };
      }

      return {
        destinations: [read.event.organizer],
        replyTargets: [read.event.organizer],
        attachments: [
          buildCardAttachment(buildEventCard(read.event, { response: parsed.data.response })),
        ],
      };
    },
    run: () =>
      Promise.resolve({
        status: 'error',
        message: `${calendarToolNames.respond} runs only queued`,
      }),
  };
}
