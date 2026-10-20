import type { Log } from '@heynixie/log';
import type { MessageSpan, OwnerMessage, ReviewReason } from './gate-types';
import type { QuoteMatch } from './get-typed-quote';
import { getTypedQuote } from './get-typed-quote';
import { readForgottenSequences } from './read-forgotten-sequences';
import type { QuoteEvidenceResult } from './read-quote-evidence';
import type { SourceMessage } from './writer-types';

// Unicode format characters: zero-width spaces and joiners, bidirectional controls, the byte order
// mark and the soft hyphen
const invisible = /\p{Cf}/u;

const failureReasons: Readonly<Record<Exclude<QuoteMatch['status'], 'typed'>, ReviewReason>> = {
  in_quoted_block: 'quote_in_quoted_block',
  not_typed: 'quote_not_typed',
  missing: 'no_quote',
};

// Finds a batch write's quote in the one message it cites, never in a window of recent messages:
// the quote must be typed there, outside every quoted block. A message that backed a forgotten
// item never backs a write again.
export async function readSourceEvidence(
  log: Pick<Log, 'writer'>,
  source: SourceMessage,
  quote: string,
): Promise<QuoteEvidenceResult> {
  if (invisible.test(quote)) {
    return { status: 'review', reason: 'invisible_character' };
  }

  const message = toOwnerMessage(source);
  const match = getTypedQuote(message, quote);

  if (match.status !== 'typed') {
    return { status: 'review', reason: failureReasons[match.status] };
  }

  const forgotten = await readForgottenSequences(log.writer.db, [source.sequence]);

  if (forgotten.has(source.sequence)) {
    return { status: 'review', reason: 'forgotten_evidence' };
  }

  return {
    status: 'found',
    message,
    evidence: { recordSequence: source.sequence, start: match.start, end: match.end },
  };
}

const spanSources: readonly MessageSpan['source'][] = ['typed', 'pasted', 'dropped', 'unknown'];

// a span with a source the gates do not know counts as unknown, which never passes as typed
function toOwnerMessage(source: SourceMessage): OwnerMessage {
  return {
    sequence: source.sequence,
    text: source.text,
    spans: source.spans.map((span) => ({
      start: span.start,
      end: span.end,
      source: spanSources.find((known) => known === span.source) ?? 'unknown',
    })),
  };
}
