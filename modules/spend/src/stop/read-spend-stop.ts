import type { SpendContext, SpendStop } from '../types';
import { pickSpendStop } from './pick-spend-stop';
import { readSpendFacts } from './read-spend-facts';

// What the stop is now, from the gateway's status, the turn count and today's raise. The watcher's
// poll calls it, and so does the runner after a step failed.
export async function readSpendStop(context: SpendContext): Promise<SpendStop> {
  const facts = await readSpendFacts(context);

  return pickSpendStop(facts);
}
