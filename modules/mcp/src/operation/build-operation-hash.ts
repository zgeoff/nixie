import { createHash } from 'node:crypto';
import { formatCanonicalJSON } from '../pin/format-canonical-json';
import type { McpOperation } from '../types';

// The action hash of an mcp proposal: the SHA-256 of the operation's canonical JSON. An answer that
// echoes an older hash than the current operation's fails as a conflict.
export function buildOperationHash(operation: McpOperation): string {
  return createHash('sha256').update(formatCanonicalJSON(operation)).digest('hex');
}
