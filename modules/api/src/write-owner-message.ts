import type { Span } from '@heynixie/contract';
import { isTimeZone } from '@heynixie/contract';
import type { JSONObject, LogRecord } from '@heynixie/log';
import { readRecordAttachments, readRecords, withWriteTransaction } from '@heynixie/log';
import {
  isFinishedState,
  ownerMessageCodec,
  writeInboxRecordsInTransaction,
} from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { normalizeSpans } from './normalize-spans';
import { probeLiveIdentity } from './probe-live-identity';
import { readClientAction } from './read-client-action';
import type { APIContext, APITables, Identity, OwnerImage } from './types';
import { writeClientAction } from './write-client-action';

interface OwnerMessageInput {
  readonly clientMessageId: string;
  readonly thread: string;
  readonly text: string;
  readonly spans: readonly Span[];
  readonly timeZone?: string | undefined;
  readonly writtenAt?: string | undefined;

  readonly images?: readonly OwnerImage[] | undefined;
}

type OwnerMessageResult =
  | { readonly status: 'written'; readonly duplicate: boolean; readonly sequence: number }
  | { readonly status: 'thread_not_found' }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

export async function writeOwnerMessage(
  context: APIContext,
  caller: Identity,
  input: OwnerMessageInput,
): Promise<OwnerMessageResult> {
  const written = await withWriteTransaction(context.log.writer, async (tx) => {
    const live = await probeLiveIdentity(tx, context, caller.identityID);

    if (!live) {
      return { status: 'unauthorized' } as const;
    }

    const earlier = await readClientAction(tx, input.clientMessageId);

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

  if (task === undefined || isFinishedState(task.state)) {
    return { status: 'thread_not_found' };
  }

  const spans = normalizeSpans(input.text, input.spans);

  const sessionLabel = await readSessionLabel(tx, pending.caller.identityID);

  const [record] = await writeInboxRecordsInTransaction(tx, context, [
    {
      kind: ownerMessageCodec.kind,
      definitions: context.definitions(),
      thread: input.thread,
      contentSource: 'owner',
      payload: ownerMessageCodec.encode({
        clientMessageId: input.clientMessageId,
        identityID: pending.caller.identityID,
        spans: spans.labelled,
        ...pickTimeZone(input.timeZone),
        ...pickWrittenAt(input.writtenAt),
        ...pickImageTypes(input.images ?? []),
      }),
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

async function readSessionLabel(tx: Transaction<unknown>, identityID: string): Promise<string> {
  const row = await tx
    .$extendTables<APITables>()
    .selectFrom('identities')
    .select('label')
    .where('identity_id', '=', identityID)
    .executeTakeFirst();

  invariant(row, 'the live session has no identity row');

  return row.label;
}

function pickTimeZone(zone: string | undefined): { readonly timeZone?: string } {
  return zone !== undefined && isTimeZone(zone) ? { timeZone: zone } : {};
}

function pickWrittenAt(writtenAt: string | undefined): { readonly writtenAt?: string } {
  const at = writtenAt === undefined ? Number.NaN : Date.parse(writtenAt);

  return Number.isNaN(at) ? {} : { writtenAt: new Date(at).toISOString() };
}

type OwnerMessagePayload = Parameters<typeof ownerMessageCodec.encode>[0];

function pickImageTypes(images: readonly OwnerImage[]): Pick<OwnerMessagePayload, 'images'> {
  return images.length === 0
    ? {}
    : { images: images.map((image) => ({ mediaType: image.mediaType })) };
}

function toSpanJSON(span: Span): JSONObject {
  return { start: span.start, end: span.end, source: span.source };
}

// A hash of the text would outlive a forget of the text, so a retry is compared with the first
// record itself.
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

  const hasSame = await probeSameImages(context, record, input.images ?? []);

  return hasSame ? { status: 'written', duplicate: true, sequence } : { status: 'reused' };
}

async function probeSameImages(
  context: APIContext,
  record: LogRecord,
  images: readonly OwnerImage[],
): Promise<boolean> {
  const sent = ownerMessageCodec.tryDecodePartial(record.payload)?.images ?? [];

  if (sent.length !== images.length) {
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
