import type { Span } from '@heynixie/contract';
import { isTimeZone } from '@heynixie/contract';
import type { JSONObject, LogRecord } from '@heynixie/log';
import { readRecordAttachments, readRecords, withWriteTransaction } from '@heynixie/log';
import { writeInboxRecordsInTransaction } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { findClientAction } from './find-client-action';
import { isLiveIdentity } from './is-live-identity';
import { normalizeSpans } from './normalize-spans';
import type { APIContext, APITables, Identity, OwnerImage } from './types';
import { writeClientAction } from './write-client-action';

interface OwnerMessageInput {
  readonly clientMessageId: string;
  readonly thread: string;
  readonly text: string;
  readonly spans: readonly Span[];
  readonly timeZone?: string | undefined;

  // the images readOwnerImages checked, in the order sent
  readonly images?: readonly OwnerImage[] | undefined;
}

type OwnerMessageResult =
  | { readonly status: 'written'; readonly duplicate: boolean; readonly sequence: number }
  | { readonly status: 'thread_not_found' }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

// Writes your message once per client message ID into its thread's task inbox, with the text, spans
// and session label encrypted together and each image sealed under the same key. checkRetry says
// which retry answers with the first sequence and which is refused.
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

  const sessionLabel = await readSessionLabel(tx, pending.caller.identityID);

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
        ...pickImageTypes(input.images ?? []),
      },
      erasable: { text: input.text, spans: spans.spans.map(toSpanJSON), sessionLabel },
      attachments: (input.images ?? []).map((image) => image.bytes),
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

// The message keeps the label its session had when it was sent, so a later rename reaches the next
// message and leaves the ones before it as they were. The label sits beside the text, as every free
// text field does, and a forget of the message forgets it too.
async function readSessionLabel(tx: Transaction<unknown>, identityID: string): Promise<string> {
  const row = await tx
    .$extendTables<APITables>()
    .selectFrom('identities')
    .select('label')
    .where('identity_id', '=', identityID)
    .executeTakeFirst();

  // the caller's session was live in this transaction, so its row is there
  invariant(row, 'the live session has no identity row');

  return row.label;
}

// The payload holds the zone, outside the erasable fields, so a reader finds where you were without
// a key. A zone the server does not know is left out.
function pickTimeZone(zone: string | undefined): { readonly timeZone?: string } {
  return zone !== undefined && isTimeZone(zone) ? { timeZone: zone } : {};
}

// The payload names each image's type, which a reader needs without a key; the bytes are sealed.
// A message with no images names none.
function pickImageTypes(images: readonly OwnerImage[]): { readonly images?: JSONObject[] } {
  return images.length === 0
    ? {}
    : { images: images.map((image) => ({ mediaType: image.mediaType })) };
}

function toSpanJSON(span: Span): JSONObject {
  return { start: span.start, end: span.end, source: span.source };
}

// nixie keeps no hash of a message's text, which would outlive a forget of the text, so a retry is
// compared with the first record itself: its thread, its image count, and its text and image bytes
// until forgotten
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

  const hasSame = await hasSameImages(context, record, input.images ?? []);

  return hasSame ? { status: 'written', duplicate: true, sequence } : { status: 'reused' };
}

// The count always compares, from the payload. The bytes compare while the first record's images
// are readable, and a forgotten record's images, unreadable with its text, compare as the same.
async function hasSameImages(
  context: APIContext,
  record: LogRecord,
  images: readonly OwnerImage[],
): Promise<boolean> {
  const sent = record.payload['images'];

  if ((Array.isArray(sent) ? sent.length : 0) !== images.length) {
    return false;
  }

  const stored = await readRecordAttachments(context.log, [record.sequence]);

  const first = stored.get(record.sequence);

  return (
    first?.status !== 'readable' ||
    first.attachments.every((bytes, index) => isSameBytes(bytes, images[index]?.bytes))
  );
}

function isSameBytes(left: Uint8Array, right: Uint8Array | undefined): boolean {
  return right?.length === left.length && left.every((byte, index) => byte === right[index]);
}
