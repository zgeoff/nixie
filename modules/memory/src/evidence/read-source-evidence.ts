import type { Log } from '@heynixie/log';
import type { MessageSpan, OwnerMessage, ReviewReason } from '../gate/gate-context';
import type { QuoteMatch } from '../typed/get-typed-quote';
import { getTypedQuote } from '../typed/get-typed-quote';
import { readForgottenSequences } from '../utils/read-forgotten-sequences';
import type { SourceMessage } from '../writer/writer-model';
import type { QuoteEvidenceResult } from './read-quote-evidence';

const invisible = /\p{Cf}/u;

const failureReasons: Readonly<Record<Exclude<QuoteMatch['status'], 'typed'>, ReviewReason>> = {
  in_quoted_block: 'quote_in_quoted_block',
  not_typed: 'quote_not_typed',
  missing: 'no_quote',
};

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

export function toOwnerMessage(source: SourceMessage): OwnerMessage {
  return {
    sequence: source.sequence,
    text: source.text,
    spans: source.spans.map((span) => ({
      start: span.start,
      end: span.end,
      source: spanSources.find((known) => known === span.source) ?? 'unknown',
    })),
    sentAt: source.sentAt,
    timeZone: source.timeZone,
  };
}
