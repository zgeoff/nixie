import { createHash } from 'node:crypto';
import type { JSONValue } from '@heynixie/log';
import { toCanonicalText } from '../utils/to-canonical-text';

// The SHA-256 of the canonical operation: the tool, its input and its resolved destinations.
export interface ActionOperation {
  readonly tool: string;
  readonly input: JSONValue;
  readonly destinations: readonly string[];

  // the time after which the action must not start; leaves the hash of an action with none as it was
  readonly deadlineAt?: number | null;

  // the URL that a prepared call expects its page to hold when the action runs; leaves the hash of
  // a call with none as it was
  readonly expectURL?: string | undefined;
}

export function buildActionHash(operation: ActionOperation): string {
  const canonical = {
    tool: operation.tool,
    input: operation.input,
    destinations: [...operation.destinations],
    ...(operation.deadlineAt === undefined || operation.deadlineAt === null
      ? {}
      : { deadlineAt: operation.deadlineAt }),
    ...(operation.expectURL === undefined ? {} : { expectURL: operation.expectURL }),
  };

  return createHash('sha256').update(toCanonicalText(canonical)).digest('hex');
}
