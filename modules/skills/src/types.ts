import type { Clock } from '@heynixie/clock';
import type { DefinitionsInForce, SkillOrigin } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import type { ProposalConfig, ProposalContext, ProposalOutcome } from '@heynixie/proposals';
import type { RelatedMemoryLookup, ToolRun } from '@heynixie/tools';
import type { skillsWriteProposedCodec } from './write/skills-write-proposed-codec';

export interface SkillToolsContext {
  readonly log: Log;
  readonly clock: Pick<Clock, 'now'>;

  // the lapse of each family; the defaults apply when the server sets none
  readonly proposalConfig?: ProposalConfig | undefined;
  readonly readInForce: () => DefinitionsInForce | null;

  readonly refreshDefinitions: () => Promise<DefinitionsInForce | null>;

  // seeds the definitions in force after a rule applies a write, and wakes the export
  readonly runInForceSeed: () => Promise<void>;

  // what skill_write looks up in memory after it applies; without it, the result carries no
  // `related`
  readonly relatedMemory?: RelatedMemoryLookup;

  readonly readSkillList: (run: ToolRun, inForce: DefinitionsInForce | null) => readonly string[];
}

type SkillProposal = ReturnType<typeof skillsWriteProposedCodec.decode>;

export interface SkillProposalState {
  readonly proposal: SkillProposal;
  readonly thread: string | null;
  readonly proposedAt: number;
  readonly outcome: ProposalOutcome | null;
}

export type SkillProposalContext = ProposalContext;

export interface SkillAnswerContext extends SkillProposalContext {
  readonly runInForceSeed: () => Promise<void>;
}

export interface SkillFile {
  readonly path: string;
  readonly text: string;
}

export interface PendingSkillProposal {
  readonly proposal: SkillProposal;
  readonly thread: string | null;
  readonly proposedAt: number;
  readonly lapseAt: number;

  readonly isStale: boolean;
  readonly inForce: {
    readonly skillHash: string;
    readonly origin: SkillOrigin;
    readonly files: readonly SkillFile[];
  } | null;
}

export type SkillProposalAnswer =
  | {
      readonly answer: 'approve';
      readonly proposalID: string;
      readonly skillHash: string;
      readonly files?: readonly SkillFile[];
      readonly identityID?: string;
    }
  | {
      readonly answer: 'reject';
      readonly proposalID: string;
      readonly skillHash: string;
      readonly reason: string;
      readonly identityID?: string;
    };

export interface SkillProposalAnswerResult {
  readonly proposalID: string;
  readonly approvalID: string | null;
  readonly skillHash: string | null;
}
