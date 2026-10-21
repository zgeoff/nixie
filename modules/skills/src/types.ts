import type { Clock } from '@heynixie/clock';
import type { DefinitionsInForce, SkillOrigin } from '@heynixie/definitions';
import type { Definitions, Log } from '@heynixie/log';
import type { ToolRun } from '@heynixie/tools';
import type { skillsWriteProposedCodec } from './skills-write-proposed-codec';

export interface SkillToolsContext {
  readonly log: Log;
  readonly clock: Pick<Clock, 'now'>;
  readonly readInForce: () => DefinitionsInForce | null;

  readonly refreshDefinitions: () => Promise<DefinitionsInForce | null>;

  readonly readSkillList: (run: ToolRun, inForce: DefinitionsInForce | null) => readonly string[];
}

type SkillProposal = ReturnType<typeof skillsWriteProposedCodec.decode>;

export type SkillProposalOutcome = 'approved' | 'rejected' | 'lapsed';

export type SkillProposalStatus = 'pending' | SkillProposalOutcome;

export interface SkillProposalState {
  readonly proposal: SkillProposal;
  readonly thread: string | null;
  readonly proposedAt: number;
  readonly outcome: SkillProposalOutcome | null;
}

export interface SkillProposalContext {
  readonly log: Log;
  readonly clock: Pick<Clock, 'now'>;
  readonly definitions: () => Definitions;
}

export interface SkillAnswerContext extends SkillProposalContext {
  readonly seedWrittenSkills: () => Promise<void>;
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
    }
  | {
      readonly answer: 'reject';
      readonly proposalID: string;
      readonly skillHash: string;
      readonly reason: string;
    };

export interface SkillProposalAnswerResult {
  readonly proposalID: string;
  readonly approvalID: string | null;
  readonly skillHash: string | null;
}
