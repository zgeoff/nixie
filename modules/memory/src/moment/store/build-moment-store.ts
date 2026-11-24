import type { ErasureHandle } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { WriteInTransaction } from '../../types';
import type {
  EditMomentRequest,
  KeepMomentRequest,
  LinkMomentRequest,
  MomentContext,
  MomentDestroy,
  MomentTables,
  MomentTarget,
  MomentWrite,
  RetireMomentRequest,
} from '../../utils/moment-context';
import type { MomentDestroyPreviewRead } from '../destroy/read-moment-destroy-preview';
import { readMomentDestroyPreview } from '../destroy/read-moment-destroy-preview';
import type { MomentErasureRequest } from '../erasure/build-moment-erasable';
import { writeKeptMoment } from '../kept/write-kept-moment';
import type { MomentRead, MomentReadRequest } from '../read-moment';
import { readMoment } from '../read-moment';
import type { MomentLink } from '../read-moment-links';
import { readMomentLinks } from '../read-moment-links';
import type { MomentFindQuery, MomentMatchPage } from '../read-moment-matches';
import { readMomentMatches } from '../read-moment-matches';
import type { MomentView } from '../read-moment-view';
import { readMomentView } from '../read-moment-view';
import type { MomentWeekCount } from '../read-week-count';
import { readWeekCount } from '../read-week-count';
import { updateMomentIndex } from '../update-moment-index';
import { writeMomentEdit } from '../write-moment-edit';
import { writeMomentLink } from '../write-moment-link';
import { writeMomentRetirement } from '../write-moment-retirement';
import type { MomentIndexes } from './start-store-indexes';

export interface MomentStore {
  readonly keep: (
    request: KeepMomentRequest,
    writeInTransaction?: WriteInTransaction,
  ) => Promise<MomentWrite>;
  readonly edit: (
    request: EditMomentRequest,
    writeInTransaction?: WriteInTransaction,
  ) => Promise<MomentWrite>;
  readonly link: (
    request: LinkMomentRequest,
    writeInTransaction?: WriteInTransaction,
  ) => Promise<MomentWrite>;
  readonly retire: (request: RetireMomentRequest) => Promise<MomentWrite>;

  readonly read: (request: MomentReadRequest) => Promise<MomentRead | null>;
  readonly readMatches: (query: MomentFindQuery) => Promise<MomentMatchPage>;
  readonly readWeekCount: (at: number) => Promise<MomentWeekCount>;
  readonly readLinks: (
    itemIDs: readonly string[],
  ) => Promise<ReadonlyMap<string, readonly MomentLink[]>>;

  // the client's whole view of one moment, with no cut and no page
  readonly readView: (momentID: string) => Promise<MomentView | null>;

  // the client's checked destroy, bound to the version its preview showed
  readonly readDestroyPreview: (target: MomentTarget) => Promise<MomentDestroyPreviewRead>;
  readonly beginDestroy: (
    target: MomentTarget,
    writeInTransaction?: WriteInTransaction,
  ) => Promise<MomentDestroy>;

  // finishes a destroy whose first part committed
  readonly finishDestroy: (momentID: string) => Promise<void>;
}

export function buildMomentStore(
  context: MomentContext,
  indexes: MomentIndexes,
  erasure: ErasureHandle<MomentErasureRequest> | null,
): MomentStore {
  const log = context.log;
  const search = { log, moments: indexes };

  return {
    keep: (request, writeInTransaction) => writeKeptMoment(context, request, writeInTransaction),
    edit: (request, writeInTransaction) => writeMomentEdit(context, request, writeInTransaction),
    link: (request, writeInTransaction) => writeMomentLink(context, request, writeInTransaction),
    retire: (request) => writeMomentRetirement(context, request),
    read: (request) => readMoment(log, request),
    readMatches: (query) => readMomentMatches(search, query),
    readWeekCount: (at) => readWeekCount(log.writer.db.$extendTables<MomentTables>(), at),
    readLinks: (itemIDs) => readMomentLinks(log, itemIDs),
    readView: (momentID) => readMomentView(log, momentID),
    readDestroyPreview: (target) => readMomentDestroyPreview(log, target),
    beginDestroy: async (target, writeInTransaction) => {
      invariant(erasure, 'the memory store holds an erasure registry');

      const begun = await erasure.begin(target, {
        by: 'user',
        ...(writeInTransaction === undefined ? {} : { writeInTransaction }),
      });

      return begun.status === 'refused'
        ? begun
        : { status: 'begun', momentID: begun.target.targetID };
    },
    finishDestroy: async (momentID) => {
      invariant(erasure, 'the memory store holds an erasure registry');

      await erasure.finish(momentID);

      await updateMomentIndex(log, indexes);
    },
  };
}
