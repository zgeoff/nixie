import type {
  EditMomentRequest,
  KeepMomentRequest,
  LinkMomentRequest,
  MomentDestroy,
  MomentDestroyContext,
  MomentTables,
  MomentTarget,
  MomentWrite,
  RetireMomentRequest,
} from './moment-types';
import type { MomentRead, MomentReadRequest } from './read-moment';
import { readMoment } from './read-moment';
import type { MomentDestroyPreviewRead } from './read-moment-destroy-preview';
import { readMomentDestroyPreview } from './read-moment-destroy-preview';
import type { MomentLink } from './read-moment-links';
import { readMomentLinks } from './read-moment-links';
import type { MomentFindQuery, MomentMatchPage } from './read-moment-matches';
import { readMomentMatches } from './read-moment-matches';
import type { MomentWeekCount } from './read-week-count';
import { readWeekCount } from './read-week-count';
import { runBegunDestroy } from './run-begun-destroy';
import { runMomentDestroy } from './run-moment-destroy';
import type { WriteInTransaction } from './types';
import { writeKeptMoment } from './write-kept-moment';
import { writeMomentEdit } from './write-moment-edit';
import { writeMomentLink } from './write-moment-link';
import { writeMomentRetirement } from './write-moment-retirement';

export interface MomentStore {
  readonly keep: (
    request: KeepMomentRequest,
    writeInTransaction?: WriteInTransaction,
  ) => Promise<MomentWrite>;
  readonly edit: (request: EditMomentRequest) => Promise<MomentWrite>;
  readonly link: (request: LinkMomentRequest) => Promise<MomentWrite>;
  readonly retire: (request: RetireMomentRequest) => Promise<MomentWrite>;

  readonly read: (request: MomentReadRequest) => Promise<MomentRead | null>;
  readonly readMatches: (query: MomentFindQuery) => Promise<MomentMatchPage>;
  readonly readWeekCount: (at: number) => Promise<MomentWeekCount>;
  readonly readLinks: (
    itemIDs: readonly string[],
  ) => Promise<ReadonlyMap<string, readonly MomentLink[]>>;

  // the client's checked destroy, bound to the version its preview showed
  readonly readDestroyPreview: (target: MomentTarget) => Promise<MomentDestroyPreviewRead>;
  readonly destroy: (
    target: MomentTarget,
    writeInTransaction?: WriteInTransaction,
  ) => Promise<MomentDestroy>;
  readonly finishDestroy: (momentID: string) => Promise<void>;
}

export function buildMomentStore(context: MomentDestroyContext): MomentStore {
  const log = context.log;

  return {
    keep: (request, writeInTransaction) => writeKeptMoment(context, request, writeInTransaction),
    edit: (request) => writeMomentEdit(context, request),
    link: (request) => writeMomentLink(context, request),
    retire: (request) => writeMomentRetirement(context, request),
    read: (request) => readMoment(log, request),
    readMatches: (query) => readMomentMatches(log, query),
    readWeekCount: (at) => readWeekCount(log.writer.db.$extendTables<MomentTables>(), at),
    readLinks: (itemIDs) => readMomentLinks(log, itemIDs),
    readDestroyPreview: (target) => readMomentDestroyPreview(log, target),
    destroy: (target, writeInTransaction) => runMomentDestroy(context, target, writeInTransaction),
    finishDestroy: (momentID) => runBegunDestroy(context, momentID),
  };
}
