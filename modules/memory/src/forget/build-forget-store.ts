import { runEvidencePurges } from '../purge/run-evidence-purges';
import { runItemPurge } from '../purge/run-item-purge';
import type { MemoryStore, StoreParts } from '../types';
import { runBegunForgets } from './run-begun-forgets';
import { runForget } from './run-forget';
import { runForgetAll } from './run-forget-all';
import { runForgetRetired } from './run-forget-retired';

export function buildForgetStore(
  parts: StoreParts,
): Pick<
  MemoryStore,
  | 'forget'
  | 'forgetRetired'
  | 'forgetAll'
  | 'finishForgets'
  | 'purgeItemEvidence'
  | 'finishEvidencePurges'
> {
  return {
    forget: (request) => runForget(parts, request),
    forgetRetired: (request) => runForgetRetired(parts, request),
    forgetAll: (request) => runForgetAll(parts, request),
    finishForgets: (itemIDs) => runBegunForgets(parts, itemIDs),
    purgeItemEvidence: (request) => runItemPurge(parts, request),
    finishEvidencePurges: (scope) => runEvidencePurges(parts, scope),
  };
}
