import type { ErasureHandle } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { runEvidencePurges } from '../purge/run-evidence-purges';
import { runItemPurge } from '../purge/run-item-purge';
import type { ItemErasureRequest, MemoryStore, StoreParts } from '../types';
import { runBegunForgets } from './run-begun-forgets';
import { runForget } from './run-forget';
import { runForgetAll } from './run-forget-all';
import { runForgetRetired } from './run-forget-retired';

export function buildForgetStore(
  parts: StoreParts,
  erasure: ErasureHandle<ItemErasureRequest> | null,
): Pick<
  MemoryStore,
  | 'forget'
  | 'forgetRetired'
  | 'forgetAll'
  | 'finishForgets'
  | 'purgeItemEvidence'
  | 'finishEvidencePurges'
> {
  // without a registry no item can be forgotten, as for a moment
  const requireErasure = () => {
    invariant(erasure, 'the memory store holds an erasure registry');

    return erasure;
  };

  return {
    forget: (request) => runForget(parts, requireErasure(), request),
    forgetRetired: (request) => runForgetRetired(parts, requireErasure(), request),
    forgetAll: (request) => runForgetAll(parts, requireErasure(), request),
    finishForgets: (itemIDs) => runBegunForgets(parts, requireErasure(), itemIDs),
    purgeItemEvidence: (request) => runItemPurge(parts, requireErasure(), request),
    finishEvidencePurges: (scope) => runEvidencePurges(parts, requireErasure(), scope),
  };
}
