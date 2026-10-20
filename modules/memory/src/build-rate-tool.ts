import type { JSONObject, JSONValue } from '@heynixie/log';
import type { ToolCall, ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import { MemoryRatingError } from './memory-rating-error';
import type { MemoryStore } from './types';

// The names the rate tool reads: the owner's name, or null for "the owner", and the agent's name
// that the owner sees beside each rating, or null when the config names none.
export interface RateToolOptions {
  readonly ownerName: string | null;
  readonly agentName: string | null;
}

const ratingInput = {
  type: 'object',
  properties: {
    item: { type: 'string', description: 'the ID of a memory you were given' },
    verdict: {
      type: 'string',
      enum: ['helpful', 'noise', 'misleading'],
      description: 'whether the memory helped, was noise, or misled you',
    },
    note: {
      type: 'string',
      maxLength: 200,
      pattern: '^[^\\r\\n]*$',
      description: 'one line on why',
    },
  },
  required: ['item', 'verdict'],
  additionalProperties: false,
};

const rateInput = {
  type: 'object',
  properties: { ratings: { type: 'array', minItems: 1, maxItems: 100, items: ratingInput } },
  required: ['ratings'],
  additionalProperties: false,
};

// Builds memory.rate, which declares note and keeps the model's ratings of the memories the
// thread's latest recall delivered, for the owner to see on that turn. A rating is no memory write:
// it passes no gate, and nothing acts on it.
export function buildRateTool(
  memory: Pick<MemoryStore, 'rate'>,
  options: RateToolOptions,
): ToolDefinition {
  const owner = options.ownerName ?? 'the owner';

  return {
    name: 'memory.rate',
    description:
      `Tell ${owner} how the memories you were given this turn worked. Use it when something ` +
      `stands out, not every turn. Nothing changes because of a rating; ${owner} sees it.`,
    input: rateInput,
    output: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['ratings'],
      results: { message: 'owner_data' },
    },
    execution: 'direct',

    // the model can copy an item's text into a note, which the item's key seals
    recordInput: buildRecordedInput,
    run: (call, context) => runRateCall(memory, { call, context, owner, options }),
  };
}

// Each rating with an item that is an ID and a known verdict, and nothing else. The runner records
// a call before the input schema checks it, so a malformed value, such as text in a verdict or an
// item, is dropped rather than kept in the call's record, which a forget never reaches.
function buildRecordedInput(input: JSONObject): JSONObject {
  const ratings = input['ratings'];

  return isJSONArray(ratings)
    ? { ratings: ratings.flatMap((rating) => toRecordedRating(rating)) }
    : {};
}

function isJSONArray(value: JSONValue | undefined): value is readonly JSONValue[] {
  return Array.isArray(value);
}

// a short ID, a lowercase letter then 9 lowercase letters or digits, or an item's UUID
const itemIDPattern =
  /^(?:[a-z][a-z0-9]{9}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u;

const verdicts: ReadonlySet<string> = new Set(['helpful', 'noise', 'misleading']);

function toRecordedRating(rating: JSONValue): readonly JSONObject[] {
  if (!isJSONObject(rating)) {
    return [];
  }

  const item = rating['item'];
  const verdict = rating['verdict'];

  return [
    {
      ...(typeof item === 'string' && itemIDPattern.test(item) ? { item } : {}),
      ...(typeof verdict === 'string' && verdicts.has(verdict) ? { verdict } : {}),
    },
  ];
}

function isJSONObject(value: JSONValue): value is JSONObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface RateCall {
  readonly call: ToolCall;
  readonly context: ToolContext;
  readonly owner: string;
  readonly options: RateToolOptions;
}

const ratingArgument = z.object({
  item: z.string(),
  verdict: z.enum(['helpful', 'noise', 'misleading']),
  note: z.string().optional(),
});

const rateArguments = z.object({ ratings: z.array(ratingArgument) });

// A refused rating is the model's to read; any other failure propagates.
async function runRateCall(
  memory: Pick<MemoryStore, 'rate'>,
  rate: RateCall,
): Promise<ToolOutcome> {
  const input = rateArguments.parse(rate.call.input);

  try {
    await memory.rate({
      thread: rate.context.run.thread,
      runID: rate.context.run.runID,
      ratedBy: rate.options.agentName,
      ratings: input.ratings,
    });

    return { status: 'ok', result: { message: `Noted for ${rate.owner}.` } };
  } catch (error) {
    if (error instanceof MemoryRatingError) {
      return { status: 'error', message: error.message };
    }

    throw error;
  }
}
