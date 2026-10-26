import type {
  EditMomentRequest,
  KeepMomentRequest,
  LinkMomentRequest,
  MomentContext,
  MomentWrite,
  RetireMomentRequest,
} from './moment-types';
import { writeKeptMoment } from './write-kept-moment';
import { writeMomentEdit } from './write-moment-edit';
import { writeMomentLink } from './write-moment-link';
import { writeMomentRetirement } from './write-moment-retirement';

export interface MomentStore {
  readonly keep: (request: KeepMomentRequest) => Promise<MomentWrite>;
  readonly edit: (request: EditMomentRequest) => Promise<MomentWrite>;
  readonly link: (request: LinkMomentRequest) => Promise<MomentWrite>;
  readonly retire: (request: RetireMomentRequest) => Promise<MomentWrite>;
}

export function buildMomentStore(context: MomentContext): MomentStore {
  return {
    keep: (request) => writeKeptMoment(context, request),
    edit: (request) => writeMomentEdit(context, request),
    link: (request) => writeMomentLink(context, request),
    retire: (request) => writeMomentRetirement(context, request),
  };
}
