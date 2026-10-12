import type { Log } from '@heynixie/log';
import type { QuoteMatch } from './find-typed-quote';
import { findTypedQuote } from './find-typed-quote';
import type { OwnerMessage, ReviewReason } from './gate-types';
import { readOwnerMessages } from './read-owner-messages';
import type { MemoryTables, QuoteEvidence } from './types';

// Where a quote's evidence lies: in a message you typed, or a review reason that says why no
// message backs it.
export type QuoteEvidenceResult =
  | {
      readonly status: 'found';
      readonly message: OwnerMessage;
      readonly evidence: QuoteEvidence;
    }
  | { readonly status: 'review'; readonly reason: ReviewReason };

export interface QuoteSearch {
  readonly thread: string;
  readonly quote: string;
  readonly window: number;
}

// Finds the quote in your latest messages, newest first: the newest one that holds it typed backs
// the write. A message that backed a forgotten item never backs one again, so a forget never
// returns through a fresh quote of the same words.
export async function findQuoteEvidence(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  search: QuoteSearch,
): Promise<QuoteEvidenceResult> {
  if (invisible.test(search.quote)) {
    return { status: 'review', reason: 'invisible_character' };
  }
  const messages = await readOwnerMessages(log, { thread: search.thread, limit: search.window });
  const matches = messages.map((message) => ({
    message,
    match: findTypedQuote(message, search.quote),
  }));
  const typed = matches.flatMap((entry) =>
    entry.match.status === 'typed'
      ? [
          {
            message: entry.message,
            evidence: {
              recordSequence: entry.message.sequence,
              start: entry.match.start,
              end: entry.match.end,
            },
          },
        ]
      : [],
  );

  if (typed.length === 0) {
    return { status: 'review', reason: pickFailure(matches.map((entry) => entry.match)) };
  }
  const forgotten = await readForgottenSequences(
    log,
    typed.map((entry) => entry.message.sequence),
  );
  const backing = typed.find((entry) => !forgotten.has(entry.message.sequence));

  return backing === undefined
    ? { status: 'review', reason: 'forgotten_evidence' }
    : { status: 'found', ...backing };
}

// Unicode format characters: zero-width spaces and joiners, bidirectional controls, the byte order
// mark and the soft hyphen
const invisible = /\p{Cf}/u;

// a quote in a quoted block anywhere says more than one that touches a pasted span, and either says
// more than a quote found nowhere
function pickFailure(matches: readonly QuoteMatch[]): ReviewReason {
  if (matches.some((match) => match.status === 'in_quoted_block')) {
    return 'quote_in_quoted_block';
  }
  if (matches.some((match) => match.status === 'not_typed')) {
    return 'quote_not_typed';
  }
  return 'no_quote';
}

async function readForgottenSequences(
  log: Pick<Log, 'writer'>,
  sequences: readonly number[],
): Promise<ReadonlySet<number>> {
  const rows = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_forgotten_evidence')
    .select('record_sequence')
    .where('record_sequence', 'in', sequences)
    .execute();

  return new Set(rows.map((row) => row.record_sequence));
}
