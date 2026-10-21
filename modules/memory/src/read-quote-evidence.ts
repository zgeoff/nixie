import type { Log } from '@heynixie/log';
import type { OwnerMessage, ReviewReason } from './gate-types';
import type { QuoteMatch } from './get-typed-quote';
import { getTypedQuote } from './get-typed-quote';
import { readForgottenSequences } from './read-forgotten-sequences';
import { readOwnerMessages } from './read-owner-messages';
import type { QuoteEvidence } from './types';

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

const invisible = /\p{Cf}/u;

export async function readQuoteEvidence(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  search: QuoteSearch,
): Promise<QuoteEvidenceResult> {
  if (invisible.test(search.quote)) {
    return { status: 'review', reason: 'invisible_character' };
  }

  const messages = await readOwnerMessages(log, { thread: search.thread, limit: search.window });

  const matches = messages.map((message) => ({
    message,
    match: getTypedQuote(message, search.quote),
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
    log.writer.db,
    typed.map((entry) => entry.message.sequence),
  );

  const backing = typed.find((entry) => !forgotten.has(entry.message.sequence));

  return backing === undefined
    ? { status: 'review', reason: 'forgotten_evidence' }
    : { status: 'found', ...backing };
}

function pickFailure(matches: readonly QuoteMatch[]): ReviewReason {
  if (matches.some((match) => match.status === 'in_quoted_block')) {
    return 'quote_in_quoted_block';
  }

  if (matches.some((match) => match.status === 'not_typed')) {
    return 'quote_not_typed';
  }

  return 'no_quote';
}
