import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { renderImageMarkers, renderOwnerText } from '@heynixie/sessions';
import { z } from 'zod';
import { buildVectorQuery } from './build-vector-query';
import { mergeRankings } from './merge-rankings';
import type {
  MessageRecallRequest,
  MessageRecallResult,
  PastMessage,
} from './message-recall-types';
import { readForgottenSequences } from './read-forgotten-sequences';
import type { VectorMatch } from './start-vector-index';
import type { SearchMode, StoreParts } from './types';
import { updateMessageIndexes } from './update-message-indexes';

const rankHeadroom = 5;

// Returns your past messages that match the query, best first. Sequences rank outside the delivery
// lock; under it each candidate is read again, and one whose key is gone or that backed a
// forgotten item is left out, so a forget that began before the check never lets its text through.
export async function readMessageRecall(
  parts: StoreParts,
  request: MessageRecallRequest,
): Promise<MessageRecallResult> {
  await updateMessageIndexes(parts);

  const vectors = parts.messages.vectors;
  const excludedIDs = request.excludedSequences.map(String);

  // a few more than the limit, so a candidate the delivery check drops leaves the next in its place
  const limit = request.limit + rankHeadroom;

  const [keywordMatches, vectorMatches] = await Promise.all([
    parts.messages.index.readMatches(request.query, {
      limit,
      minScore: request.minScore,
      excludedIDs,
      excludedWords: request.excludedWords,
    }),
    readVectorMatches(vectors, request, { limit, excludedIDs }),
  ]);

  const ranked = mergeRankings(keywordMatches, vectorMatches ?? []).map((match) =>
    Number(match.itemID),
  );

  const messages =
    request.limit === 0
      ? []
      : await parts.lock(() => readDeliverableMessages(parts, ranked, request.limit));

  return { messages, searchMode: pickSearchMode(vectors === null, vectorMatches) };
}

interface VectorLimits {
  readonly limit: number;
  readonly excludedIDs: readonly string[];
}

// the vector index's matches for the query less its excluded words, or null while the index
// rebuilds or with no encoder
function readVectorMatches(
  vectors: StoreParts['messages']['vectors'],
  request: MessageRecallRequest,
  limits: VectorLimits,
): Promise<readonly VectorMatch[] | null> {
  if (vectors === null) {
    return Promise.resolve(null);
  }

  return vectors.readMatches(buildVectorQuery(request.query, request.excludedWords), {
    limit: limits.limit,
    minSimilarity: request.minSimilarity,
    excludedIDs: limits.excludedIDs,
  });
}

// the candidates in rank order that are still readable and backed no forgotten item, up to the limit
async function readDeliverableMessages(
  parts: StoreParts,
  sequences: readonly number[],
  limit: number,
): Promise<readonly PastMessage[]> {
  const forgotten = await readForgottenSequences(parts.context.log.writer.db, sequences);

  const messages: PastMessage[] = [];

  for (const sequence of sequences.filter((candidate) => !forgotten.has(candidate))) {
    if (messages.length === limit) {
      break;
    }

    const record = await readMessageRecord(parts, sequence);

    if (record !== null) {
      messages.push(toPastMessage(record));
    }
  }

  return messages;
}

// your message at the sequence, or null once a forget erased it
async function readMessageRecord(parts: StoreParts, sequence: number): Promise<LogRecord | null> {
  const [entry] = await readRecords(parts.context.log, {
    afterSequence: sequence - 1,
    kinds: ['owner_message'],
    limit: 1,
  });

  const record = entry?.record;

  return record?.sequence === sequence && record.erasable.status === 'readable' ? record : null;
}

// the message as the conversation renders it, with each paste in its own block and a marker line
// for each image; a long message is cut before it renders, so a cut never leaves a block open
function toPastMessage(record: LogRecord): PastMessage {
  const cut = toCutRecord(record);

  return {
    sequence: record.sequence,
    thread: record.thread,
    recordedAt: record.recordedAt.getTime(),
    text: [renderOwnerText(cut.record), ...renderImageMarkers(cut.record)].join('\n'),
    isCut: cut.isCut,
  };
}

interface CutRecord {
  readonly record: LogRecord;
  readonly isCut: boolean;
}

const textLimit = 1000;
const messageSpans = z.array(z.object({ start: z.int(), end: z.int(), source: z.string() }));

// the record with its text cut to textLimit characters and each span cut to match
function toCutRecord(record: LogRecord): CutRecord {
  const fields = record.erasable.status === 'readable' ? record.erasable.fields : null;
  const text = fields?.['text'];
  const spans = messageSpans.safeParse(fields?.['spans']);

  if (fields === null || typeof text !== 'string' || text.length <= textLimit) {
    return { record, isCut: false };
  }

  return {
    record: {
      ...record,
      erasable: {
        status: 'readable',
        fields: {
          ...fields,
          text: text.slice(0, textLimit),
          spans: (spans.success ? spans.data : [])
            .filter((span) => span.start < textLimit)
            .map((span) => ({
              start: span.start,
              end: Math.min(span.end, textLimit),
              source: span.source,
            })),
        },
      },
    },
    isCut: true,
  };
}

function pickSearchMode(
  hasNoEncoder: boolean,
  vectorMatches: readonly VectorMatch[] | null,
): SearchMode {
  if (hasNoEncoder) {
    return 'keyword';
  }

  return vectorMatches === null ? 'keyword-fallback' : 'hybrid';
}
