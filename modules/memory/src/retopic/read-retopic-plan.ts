import type { StoreParts } from '../types';
import { TopicMoveError } from '../utils/error/topic-move-error';
import { buildRetopicPlan } from './build-retopic-plan';
import { readRetopicItems } from './read-retopic-items';
import type { RetopicPlan, RetopicPlanResult, RetopicSource, RetopicTarget } from './types';

// What a move would change, from the items as they stand, or the refusal that a move of nothing, of
// an unknown item or onto the same topic and subject earns. It writes nothing.
export function readRetopicPlan(
  parts: StoreParts,
  source: RetopicSource,
  target: RetopicTarget,
): Promise<RetopicPlanResult> {
  return parts.lock(async () => {
    const items = await readRetopicItems(parts);

    return buildRetopicPlan(items, source, target);
  });
}

// The plan of a move, or the refusal thrown as an error. The caller holds the store lock.
export async function requireRetopicPlan(
  parts: Pick<StoreParts, 'context' | 'labels'>,
  source: RetopicSource,
  target: RetopicTarget,
): Promise<RetopicPlan> {
  const items = await readRetopicItems(parts);

  const planned = buildRetopicPlan(items, source, target);

  if (planned.status === 'refused') {
    throw new TopicMoveError(planned.code, planned.message);
  }

  return planned.plan;
}
