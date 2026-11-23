import { withFreshChecker } from '../checker/with-fresh-checker';
import { writeFoldOrder } from '../fold/write-fold-order';
import type { MemoryWrites } from '../gate/gate-context';
import { writeGatedLabels } from '../gated/write-gated-labels';
import { writeGatedPin } from '../gated/write-gated-pin';
import { writeGatedRemember } from '../gated/write-gated-remember';
import { writeGatedRetirement } from '../gated/write-gated-retirement';
import { readItemLabels } from '../label/read-item-labels';
import { readRetopicPlan } from '../retopic/read-retopic-plan';
import { writeRetopic } from '../retopic/write-retopic';
import type { StoreParts } from '../types';
import { readItemSubject } from '../write/read-item-subject';
import { readRememberSources } from '../write/read-remember-sources';
import { readRetireSources } from '../write/read-retire-sources';
import { writeUnpin } from './write-unpin';

export function buildMemoryWrites(parts: StoreParts): MemoryWrites {
  return {
    remember: (request) => withFreshChecker(() => writeGatedRemember(parts, request)),
    editLabels: (request) => writeGatedLabels(parts, request),
    retire: (request) => withFreshChecker(() => writeGatedRetirement(parts, request)),
    pin: (request) => writeGatedPin(parts, request),
    unpin: (request) => writeUnpin(parts, request),
    readRememberSources: (request) => readRememberSources(parts, request),
    readRetireSources: (request) => readRetireSources(parts, request),
    readItemSubject: (itemID) => readItemSubject(parts, itemID),
    readItemLabels: (itemID) => readItemLabels(parts, itemID),
    readTopics: (excludedItemID) => Promise.resolve(parts.labels.collectTopics(excludedItemID)),
    retopic: (request) => writeRetopic(parts, request),
    readRetopicPlan: (source, target) => readRetopicPlan(parts, source, target),
    writeFoldOrder: (request) => writeFoldOrder(parts, request),
  };
}
