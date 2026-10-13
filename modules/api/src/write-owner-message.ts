import type { Span } from '@heynixie/contract';
import { isTimeZone } from '@heynixie/contract';
import type { JSONObject } from '@heynixie/log';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { writeInboxRecordsInTransaction } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { findClientAction } from './find-client-action';
import { isLiveIdentity } from './is-live-identity';
import { normalizeSpans } from './normalize-spans';
import type { APIContext, APITables, Identity } from './types';
import { writeClientAction } from './write-client-action';

interface OwnerMessageInput {
  readonly clientMessageId: string;
  readonly thread: string;
  readonly text: string;
  readonly spans: readonly Span[];
  readonly timeZone?: string | undefined;
}

type OwnerMessageResult =
  | { readonly status: 'written'; readonly duplicate: boolean; readonly sequence: number }
  | { readonly status: 'thread_not_found' }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

// Writes your message once per client message ID into the inbox of the task its thread names, with
// the text and spans encrypted together. A retry answers with the first sequence, and the same ID
// with another thread or text is refused; once the text is forgotten, only the thread is compared.
export async function writeOwnerMessage(
  context: APIContext,
  caller: Identity,
  input: OwnerMessageInput,
): Promise<OwnerMessageResult> {
  const written = await withWriteTransaction(context.log.writer, async (tx) => {
    const live = await isLiveIdentity(tx, context, caller.identityID);

    if (!live) {
      return { status: 'unauthorized' } as const;
    }
    const earlier = await findClientAction(tx, input.clientMessageId);

    if (earlier !== null) {
      const isRetry =
        earlier.procedure === 'conversation.send' && earlier.identityID === caller.identityID;

      return { status: 'earlier', isRetry, result: earlier.result } as const;
    }
    return writeMessage(tx, context, { caller, input });
  });

  if (written.status !== 'earlier') {
    return written;
  }
  if (!written.isRetry) {
    return { status: 'reused' };
  }
  return checkRetry(context, input, Number(written.result['sequence']));
}

interface PendingMessage {
  readonly caller: Identity;
  readonly input: OwnerMessageInput;
}

async function writeMessage(
  tx: Transaction<unknown>,
  context: APIContext,
  pending: PendingMessage,
): Promise<OwnerMessageResult> {
  const input = pending.input;
  const task = await tx
    .$extendTables<APITables>()
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', input.thread)
    .executeTakeFirst();

  // a task that ended takes no input, so its thread takes no message
  if (task === undefined || task.state === 'done' || task.state === 'failed') {
    return { status: 'thread_not_found' };
  }
  const spans = normalizeSpans(input.text, input.spans);
  const [record] = await writeInboxRecordsInTransaction(tx, context, [
    {
      kind: 'owner_message',
      definitions: context.definitions(),
      thread: input.thread,
      contentSource: 'owner',
      payload: {
        clientMessageId: input.clientMessageId,
        identityID: pending.caller.identityID,
        spans: spans.labelled,
        ...pickTimeZone(input.timeZone),
      },
      erasable: { text: input.text, spans: spans.spans.map(toSpanJSON) },
    },
  ]);

  invariant(record, 'the log wrote no owner_message record');
  await writeClientAction(tx, {
    clientActionID: input.clientMessageId,
    procedure: 'conversation.send',
    identityID: pending.caller.identityID,
    inputHash: null,
    result: { sequence: record.sequence },
    recordedAt: context.clock.now(),
  });
  return { status: 'written', duplicate: false, sequence: record.sequence };
}

// The payload holds the zone, outside the erasable fields, so a reader finds where you were without
// a key. A zone the server does not know is left out.
function pickTimeZone(zone: string | undefined): { readonly timeZone?: string } {
  return zone !== undefined && isTimeZone(zone) ? { timeZone: zone } : {};
}

function toSpanJSON(span: Span): JSONObject {
  return { start: span.start, end: span.end, source: span.source };
}

// nixie keeps no hash of a message's text, which would outlive a forget of the text, so a retry is
// compared with the first record itself
async function checkRetry(
  context: APIContext,
  input: OwnerMessageInput,
  sequence: number,
): Promise<OwnerMessageResult> {
  const [entry] = await readRecords(context.log, { afterSequence: sequence - 1, limit: 1 });
  const record = entry?.record;

  if (record?.sequence !== sequence || record.thread !== input.thread) {
    return { status: 'reused' };
  }
  if (record.erasable.status === 'readable' && record.erasable.fields['text'] !== input.text) {
    return { status: 'reused' };
  }
  return { status: 'written', duplicate: true, sequence };
}
