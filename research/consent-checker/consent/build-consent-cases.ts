import { z } from 'zod';
// @boundaries-ignore a spike imports the code it measures
import { spanSchema } from '../../../libs/contract/src/span-schema.ts';
// @boundaries-ignore the spike reads the export the retrieval spike reads
import type { PlainRecord } from '../../memory-retrieval/real-turns/read-plain-export.ts';
import type { ConsentCall, ConsentCase, ConsentMessage } from './types.ts';

export interface CaseCounts {
  turns: number;
  messagesUnreadable: number;
  messagesUnknownSpans: number;
  callsUnreadable: number;
  callsReadOnly: number;
  callsWithoutMessage: number;
  natural: number;
  swapped: number;
  naturalByTool: Record<string, number>;
}

export interface BuiltCases {
  cases: ConsentCase[];
  counts: CaseCounts;
}

// The tools whose effect declaration holds only `read`. A read needs no consent, so its calls stay
// out of the cases.
export const readOnlyTools: ReadonlySet<string> = new Set([
  'log.read',
  'memory.diff',
  'memory.pending',
  'memory.recall',
  'prompt_read',
  'skill_pending',
  'skill_read',
  'time.now',
]);

// The most inbox records the sessions module puts in one turn's batch.
const inboxBatchLimit = 64;

const conversationThread = 'conversation';
const stepCommittedSchema = z.object({ readCursor: z.int() });
const ownerFieldsSchema = z.object({ text: z.string(), spans: z.array(spanSchema) });
const ownerPayloadSchema = z.object({ spans: z.enum(['as_sent', 'unknown']) });
const toolPayloadSchema = z.object({ tool: z.string() });

interface Turn {
  stepSequence: number;
  messages: ConsentMessage[];
  calls: ConsentCall[];
}

// Groups the conversation's tool calls into turns. A step that reads an owner message starts a turn
// with the messages of its batch, and a later step with no owner message in its batch, such as the
// one after a tool result, continues that turn. Each call that needs consent pairs with its turn's
// messages, and each turn with such a call also pairs with a call from a turn that used none of its
// tools, so the swapped call is never the action the turn's own messages asked for.
export function buildConsentCases(records: readonly PlainRecord[]): BuiltCases {
  const counts: CaseCounts = {
    turns: 0,
    messagesUnreadable: 0,
    messagesUnknownSpans: 0,
    callsUnreadable: 0,
    callsReadOnly: 0,
    callsWithoutMessage: 0,
    natural: 0,
    swapped: 0,
    naturalByTool: {},
  };
  const turns: Turn[] = [];
  let inbox: PlainRecord[] = [];
  let open: Turn | null = null;
  let lastStarted = 0;

  for (const record of records) {
    if (record.thread !== conversationThread) {
      continue;
    }

    if (record.kind === 'owner_message') {
      inbox.push(record);
    } else if (record.kind === 'task.step_committed') {
      const { readCursor } = stepCommittedSchema.parse(record.payload);

      inbox = inbox.filter((entry) => entry.sequence > readCursor);

      // The commit's cursor is the last inbox record the step read, and the inbox also holds records
      // of other kinds that the export leaves out, so the cursor bounds the turn's batch exactly.
      if (open !== null && open.stepSequence === lastStarted) {
        open.messages = open.messages.filter((message) => message.sequence <= readCursor);
      }
    } else if (record.kind === 'task.step_started') {
      lastStarted = record.sequence;

      // A step that never commits keeps no cursor, so its batch falls back to the inbox limit.
      const batch = inbox.slice(0, inboxBatchLimit);

      if (batch.length > 0) {
        open = { stepSequence: record.sequence, messages: collectMessages(batch, counts), calls: [] };
        turns.push(open);
      }
    } else if (record.kind === 'tool_called') {
      const call = pickConsentCall(record, counts);

      if (call === null) {
        continue;
      }

      if (open === null || open.messages.length === 0) {
        counts.callsWithoutMessage += 1;

        continue;
      }

      open.calls.push(call);
    }
  }

  const withCalls = turns.filter((turn) => turn.messages.length > 0 && turn.calls.length > 0);
  const cases: ConsentCase[] = [];

  counts.turns = turns.length;
  counts.callsWithoutMessage += turns
    .filter((turn) => turn.messages.length === 0)
    .reduce((sum, turn) => sum + turn.calls.length, 0);

  for (const [index, turn] of withCalls.entries()) {
    for (const call of turn.calls) {
      cases.push({
        caseID: `${turn.stepSequence}/${call.sequence}`,
        bucket: 'natural',
        stepSequence: turn.stepSequence,
        messages: turn.messages,
        call,
      });
      counts.natural += 1;
      counts.naturalByTool[call.tool] = (counts.naturalByTool[call.tool] ?? 0) + 1;
    }

    const other = findSwapTurn(withCalls, index);
    const call = other?.calls[0];

    if (call !== undefined) {
      cases.push({
        caseID: `${turn.stepSequence}/x${call.sequence}`,
        bucket: 'swapped',
        stepSequence: turn.stepSequence,
        messages: turn.messages,
        call,
      });
      counts.swapped += 1;
    }
  }

  return { cases, counts };
}

// The first turn from half the list away, going round, whose calls use none of this turn's tools.
// The same export always gives the same pairs.
function findSwapTurn(turns: readonly Turn[], index: number): Turn | undefined {
  const own = turns[index];
  const ownTools = new Set(own?.calls.map((call) => call.tool));
  const start = index + Math.floor(turns.length / 2);

  for (let step = 0; step < turns.length; step += 1) {
    const other = turns[(start + step) % turns.length];

    if (other !== undefined && other !== own && other.calls.every((call) => !ownTools.has(call.tool))) {
      return other;
    }
  }

  return undefined;
}

function collectMessages(batch: readonly PlainRecord[], counts: CaseCounts): ConsentMessage[] {
  return batch.flatMap((record) => {
    if (record.erasable.status !== 'readable') {
      counts.messagesUnreadable += 1;

      return [];
    }

    if (ownerPayloadSchema.parse(record.payload).spans === 'unknown') {
      counts.messagesUnknownSpans += 1;

      return [];
    }

    const fields = ownerFieldsSchema.parse(record.erasable.fields);

    return [{ sequence: record.sequence, text: fields.text, spans: fields.spans }];
  });
}

function pickConsentCall(record: PlainRecord, counts: CaseCounts): ConsentCall | null {
  const { tool } = toolPayloadSchema.parse(record.payload);

  if (readOnlyTools.has(tool)) {
    counts.callsReadOnly += 1;

    return null;
  }

  if (record.erasable.status !== 'readable') {
    counts.callsUnreadable += 1;

    return null;
  }

  return { sequence: record.sequence, tool, input: record.erasable.fields['input'] ?? null };
}
