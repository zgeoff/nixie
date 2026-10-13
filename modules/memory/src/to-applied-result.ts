import type { ApprovalResult } from './gate-types';
import type { VersionRef } from './types';

// The result of an approval that applied, with the version it wrote.
export function toAppliedResult(ref: VersionRef): ApprovalResult {
  return { status: 'applied', itemID: ref.itemID, version: ref.version };
}
