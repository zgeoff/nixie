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
import type { MomentLink } from './read-moment-links';
import { readMomentLinks } from './read-moment-links';
import type { MomentFindQuery, MomentMatchPage } from './read-moment-matches';
import { readMomentMatches } from './read-moment-matches';
import type { MomentWeekCount } from './read-week-count';
import { readWeekCount } from './read-week-count';
import { runMomentDestroy } from './run-moment-destroy';
import { writeKeptMoment } from './write-kept-moment';
import { writeMomentEdit } from './write-moment-edit';
import { writeMomentLink } from './write-moment-link';
import { writeMomentRetirement } from './write-moment-retirement';

export interface MomentStore {
  readonly keep: (request: KeepMomentRequest) => Promise<MomentWrite>;
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
  readonly destroy: (target: MomentTarget) => Promise<MomentDestroy>;
}

export function buildMomentStore(context: MomentDestroyContext): MomentStore {
  const log = context.log;

  return {
    keep: (request) => writeKeptMoment(context, request),
    edit: (request) => writeMomentEdit(context, request),
    link: (request) => writeMomentLink(context, request),
    retire: (request) => writeMomentRetirement(context, request),
    read: (request) => readMoment(log, request),
    readMatches: (query) => readMomentMatches(log, query),
    readWeekCount: (at) => readWeekCount(log.writer.db.$extendTables<MomentTables>(), at),
    readLinks: (itemIDs) => readMomentLinks(log, itemIDs),
    destroy: (target) => runMomentDestroy(context, target),
  };
}
