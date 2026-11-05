import { match } from 'ts-pattern';
import type { TurnCase } from './build-turn-cases.ts';
import { countWords } from './count-words.ts';

// What a short message does in place of the shipped retrieval. A message is short when it holds
// at most `maxWords` words. A window rule applies to every message: it adds the user's last few
// messages to the query, so a turn that answers an earlier one can still reach its topic.
export type ShortRule =
  | { kind: 'none' }
  | { kind: 'skip' | 'previous' | 'agree' | 'vectors'; maxWords: number }
  | { kind: 'window'; messages: number };

export interface QueryChoice {
  text: string;
  isSkipped: boolean;
  isAgreementNeeded: boolean;
  isVectorOnly: boolean;
}

// The previous reply is cut, so a long answer does not drown the message.
const replyLimit = 600;

// Picks the query a turn ranks with: the message, or what the typed parts of it leave when pasted
// text is dropped, and for a short message, what the short rule makes of it.
export function pickTurnQuery(
  turn: Pick<TurnCase, 'query' | 'typedQuery' | 'earlier'>,
  rule: ShortRule,
  isPastedDropped: boolean,
): QueryChoice {
  const text = isPastedDropped ? turn.typedQuery : turn.query;
  const plain = { text, isSkipped: text.trim() === '', isAgreementNeeded: false, isVectorOnly: false };

  if (rule.kind === 'none') {
    return plain;
  }

  if (rule.kind === 'window') {
    const earlier = turn.earlier.slice(Math.max(0, turn.earlier.length - rule.messages));

    return { ...plain, text: [...earlier.map((exchange) => exchange.owner), text].join('\n') };
  }

  if (countWords(text) > rule.maxWords) {
    return plain;
  }

  return match(rule.kind)
    .with('skip', () => ({ ...plain, isSkipped: true }))
    .with('agree', () => ({ ...plain, isAgreementNeeded: true }))
    .with('vectors', () => ({ ...plain, isVectorOnly: true }))
    .with('previous', () => {
      const previous = turn.earlier.at(-1);

      return previous === undefined
        ? plain
        : { ...plain, text: [previous.owner, previous.reply.slice(0, replyLimit), text].join('\n') };
    })
    .exhaustive();
}
