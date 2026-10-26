import type { Clock } from '@heynixie/clock';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildMomentCaller } from './build-moment-caller';
import type { MomentStore } from './build-moment-store';
import { makeInputRecorder } from './make-input-recorder';
import { renderMomentRefusal } from './render-moment-refusal';

const eventIDPattern = '^[0-9]{1,15}$';

const keepArguments = z.object({
  firstEventID: z.string(),
  lastEventID: z.string(),
  title: z.string(),
});

export function buildMomentKeepTool(
  moments: Pick<MomentStore, 'keep' | 'readWeekCount'>,
  clock: Pick<Clock, 'now'>,
): ToolDefinition {
  return {
    name: 'moment.keep',
    description:
      'Keeps a stretch of your own thread whole as a moment, so you or a later model can return ' +
      'to it in its own words: where a rule was set, or a hard case was decided. Pass the ' +
      'eventIDs of its first and last events, as log.read shows them, and a short title. ' +
      'Write no reflection now: read the moment again with moment.read on a later turn, then ' +
      'add your reflection with moment.edit. The result counts the moments kept over the last 7 ' +
      'days across every task; the count never stops a keep, so keep a moment when it matters.',
    input: {
      type: 'object',
      properties: {
        firstEventID: { type: 'string', pattern: eventIDPattern },
        lastEventID: { type: 'string', pattern: eventIDPattern },
        title: { type: 'string', minLength: 1, maxLength: 120 },
      },
      required: ['firstEventID', 'lastEventID', 'title'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        momentID: { type: 'string' },
        keptThisWeek: { type: 'integer' },
        reflection: { type: 'string', enum: ['pending'] },
      },
      required: ['momentID', 'keptThisWeek', 'reflection'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['title'],
      results: { momentID: 'owner_data', keptThisWeek: 'owner_data', reflection: 'owner_data' },
    },
    execution: 'direct',

    recordInput: makeInputRecorder(['title']),
    run: async (call, context) => {
      const input = keepArguments.parse(call.input);

      const kept = await moments.keep({
        caller: buildMomentCaller(context),
        thread: context.run.thread,
        firstSequence: Number(input.firstEventID),
        lastSequence: Number(input.lastEventID),
        title: input.title,
      });

      if (kept.status === 'refused') {
        return { status: 'error', message: renderMomentRefusal(kept.reason) };
      }

      const count = await moments.readWeekCount(clock.now());

      return {
        status: 'ok',
        result: { momentID: kept.shortID, keptThisWeek: count.total, reflection: 'pending' },
        record: { momentID: kept.momentID, version: kept.version, keptThisWeek: count.total },
      };
    },
  };
}
