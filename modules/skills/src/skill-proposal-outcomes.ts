import type { RecordKind } from '@heynixie/log';
import type { SkillProposalOutcome } from './types';

// Each record kind that closes a skill proposal, with the outcome it records.
export const skillProposalOutcomes: ReadonlyMap<RecordKind, SkillProposalOutcome> = new Map([
  ['skills.write_approved', 'approved'],
  ['skills.write_rejected', 'rejected'],
  ['skills.write_lapsed', 'lapsed'],
]);
