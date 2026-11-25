import type { JSONObject, LogRecord } from '@heynixie/log';
import { JSON_OBJECT_SCHEMA } from '@heynixie/log';
import { taskMessageCodec, triggerTaskInputCodec } from '@heynixie/tasks';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { sessionStateSchema } from '../record/session-state-schema';
import { sessionEventSchema } from '../source/session-event-schema';
import type { SessionEvent, SessionState } from '../types';

export type InboxItem =
  | {
      readonly kind: 'outcome';
      readonly sequence: number;
      readonly actionID: string;
      readonly tool: string;
      readonly status: 'done' | 'failed' | 'unknown' | 'cancelled';
      readonly result: JSONObject | null;

      // the provider's message, else the queue's reason
      readonly reason: string;
    }
  | {
      readonly kind: 'message';
      readonly sequence: number;

      // null for a message of the user's
      readonly messageID: string | null;
      readonly from: string | null;
      readonly body: string;
      readonly hop: number;

      // the brief that the start wrote as the task's first message
      readonly isBrief: boolean;
    }
  | {
      readonly kind: 'event';
      readonly sequence: number;

      // null once a forget erased the event
      readonly event: SessionEvent | null;

      // the state of a state event, from the record's facts, which a forget keeps
      readonly state: SessionState | null;
    }
  | { readonly kind: 'other'; readonly sequence: number };

const outcomePayloadSchema = z.object({
  actionID: z.string(),
  tool: z.string(),
  status: z.enum(['done', 'failed', 'unknown', 'cancelled']),
  reason: z.string().nullable(),
});

const outcomeFieldsSchema = z.object({
  result: JSON_OBJECT_SCHEMA.optional(),
  message: z.string().optional(),
});

const stateFactsSchema = z.object({ kind: z.literal('state'), state: sessionStateSchema });

// What the coding step reads of one record of its inbox. A record whose text a forget erased reads
// as empty text.
export function toInboxItem(record: LogRecord): InboxItem {
  const fields = record.erasable.status === 'readable' ? record.erasable.fields : {};

  return match(record.kind)
    .returnType<InboxItem>()
    .with('action.outcome', () => {
      const outcome = outcomePayloadSchema.parse(record.payload);
      const details = outcomeFieldsSchema.parse(fields);

      return {
        kind: 'outcome',
        sequence: record.sequence,
        actionID: outcome.actionID,
        tool: outcome.tool,
        status: outcome.status,
        result: details.result ?? null,
        reason: details.message ?? outcome.reason ?? outcome.status,
      };
    })
    .with('task_message', () => {
      const message = taskMessageCodec.decode(record.payload);

      return {
        kind: 'message',
        sequence: record.sequence,
        messageID: message.messageID,
        from: message.from,
        body: getText(fields, 'body'),
        hop: message.hop,
        isBrief: message.hop === 0,
      };
    })
    .with('owner_message', () => ({
      kind: 'message',
      sequence: record.sequence,
      messageID: null,
      from: null,
      body: getText(fields, 'text'),
      hop: 0,
      isBrief: false,
    }))
    .with('trigger.task_input', () => {
      const event = sessionEventSchema.safeParse(fields['event']);
      const input = triggerTaskInputCodec.decode(record.payload);
      const state = stateFactsSchema.safeParse(input.facts);

      return {
        kind: 'event',
        sequence: record.sequence,
        event: event.success ? event.data : null,
        state: state.success ? state.data.state : null,
      };
    })
    .otherwise(() => ({ kind: 'other', sequence: record.sequence }));
}

function getText(fields: JSONObject, name: string): string {
  const value = fields[name];

  return typeof value === 'string' ? value : '';
}
