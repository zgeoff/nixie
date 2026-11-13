import type { ApprovalResult } from './gate-context';
import type { VersionRef } from './types';

export function toAppliedResult(ref: VersionRef): ApprovalResult {
  return { status: 'applied', itemID: ref.itemID, version: ref.version };
}
