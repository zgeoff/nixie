import { createHash } from 'node:crypto';
import type { JSONValue } from '@heynixie/log';
import { toCanonicalText } from './to-canonical-text';

// The SHA-256 of the canonical operation: the tool, its input and its resolved destinations.
export interface ActionOperation {
  readonly tool: string;
  readonly input: JSONValue;
  readonly destinations: readonly string[];
}

export function buildActionHash(operation: ActionOperation): string {
  const canonical = {
    tool: operation.tool,
    input: operation.input,
    destinations: [...operation.destinations],
  };

  return createHash('sha256').update(toCanonicalText(canonical)).digest('hex');
}
