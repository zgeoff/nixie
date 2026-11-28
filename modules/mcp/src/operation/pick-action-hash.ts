import { createHash } from 'node:crypto';
import { formatCanonicalJSON } from '../pin/format-canonical-json';
import type { McpOperation } from '../types';
import { buildOperationHash } from './build-operation-hash';

// The action hash that an answer must echo. A server proposal stored with a `trusted` flag in its
// facts keeps its stored hash, as long as the facts it binds are the ones of the operation.
export function pickActionHash(operation: McpOperation, storedHash: string): string {
  if (operation.change !== 'server') {
    return buildOperationHash(operation);
  }

  const isStoredWithFlag = [true, false].some(
    (trusted) =>
      createHash('sha256')
        .update(formatCanonicalJSON({ ...operation, facts: { ...operation.facts, trusted } }))
        .digest('hex') === storedHash,
  );

  return isStoredWithFlag ? storedHash : buildOperationHash(operation);
}
