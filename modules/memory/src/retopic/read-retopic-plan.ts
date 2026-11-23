import type { StoreParts } from '../types';
import { TopicMoveError } from '../utils/error/topic-move-error';
import { buildRetopicPlan } from './build-retopic-plan';
import { readRetopicItems } from './read-retopic-items';
import type { RetopicPlan, RetopicSource, RetopicTarget } from './types';

// What a move would change, from the items as they stand. It throws the refusal that a move of
// nothing, of an unknown item or onto the same topic and subject earns, and writes nothing.
export function readRetopicPlan(
  parts: StoreParts,
  source: RetopicSource,
  target: RetopicTarget,
): Promise<RetopicPlan> {
  return parts.lock(() => requireRetopicPlan(parts, source, target));
}

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
