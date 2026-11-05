// @boundaries-ignore a spike imports the code it measures
import { buildVectorQuery } from '../../../modules/memory/src/build-vector-query.ts';
// @boundaries-ignore a spike imports the code it measures
import type { Encoder } from '../../../modules/memory/src/types.ts';
import { messageKeyPrefix } from './build-rating-sample.ts';
import { buildSimilarity } from './build-similarity.ts';
import type { TurnCase } from './build-turn-cases.ts';
import { SHIPPED } from './rank-turn.ts';
import type { RatedMessage } from './score-message-floors.ts';
import type { Gold } from './score-turns.ts';

// Encodes the indexed text of each past message a labelled turn was shown, and its query, because
// the log keeps no score for a past message. A message the product never indexed is left out.
export async function readRatedMessages(
  turns: Pick<TurnCase, 'caseID' | 'query' | 'shownMessages'>[],
  gold: ReadonlyMap<string, Pick<Gold, 'isLabelled' | 'messages'>>,
  indexed: ReadonlyMap<number, string>,
  encoder: Encoder,
  excludedWords: string[],
): Promise<RatedMessage[]> {
  const rated: RatedMessage[] = [];

  for (const turn of turns) {
    const expected = gold.get(turn.caseID);
    const queryText = buildVectorQuery(turn.query, excludedWords);
    const shown = turn.shownMessages.flatMap((message) => {
      const text = indexed.get(message.sequence);

      return text === undefined ? [] : [{ sequence: message.sequence, text }];
    });

    if (expected?.isLabelled !== true || shown.length === 0 || queryText.trim() === '') {
      continue;
    }

    const [query, ...messages] = [
      ...(await encoder.encode([queryText], 'query')),
      ...(await encoder.encode(
        shown.map((message) => message.text),
        'document',
      )),
    ];

    for (const [position, message] of shown.entries()) {
      rated.push({
        similarity: buildSimilarity(query ?? new Float32Array(), messages[position] ?? new Float32Array(), SHIPPED),
        isHelpful: expected.messages.has(`${messageKeyPrefix}${message.sequence}`),
      });
    }
  }

  return rated;
}
