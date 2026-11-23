import type { RetopicPlanResult } from './types';

// What the call stores with its own record when it asks: the move in words, and each item with its
// gist and where it moves from, so the approval card shows them and an approval can tell that the
// items changed since. A move that refuses stores its refusal in place of the items.
export function buildRetopicCard(result: RetopicPlanResult): Uint8Array<ArrayBuffer> {
  const card =
    result.status === 'refused'
      ? { sentence: result.message, items: [] }
      : {
          sentence: result.plan.sentence,
          items: result.plan.moves.map((move) => ({
            itemID: move.itemID,
            id: move.shortID,
            gist: move.gist,
            from: `${move.fromSubject}/${move.fromTopic}`,
          })),
        };

  return new TextEncoder().encode(JSON.stringify(card));
}
