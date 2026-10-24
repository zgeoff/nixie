import type { CheckedTables } from '@heynixie/db';
import type { Log } from '@heynixie/log';
import type { ProposalContext, ProposalOutcome } from '@heynixie/proposals';
import type { promptsOverrideProposedCodec } from './prompts-override-proposed-codec';

interface PromptOwner {
  readonly name: string | null;
}

export interface PromptContexts {
  readonly writer: {
    readonly persona: string;
    readonly owner: PromptOwner;
    readonly assistant: { readonly name: string | null };
  };
  readonly consolidator: {
    readonly persona: string;
    readonly owner: PromptOwner;
    readonly memory: { readonly maxChanges: number };
  };
  readonly 'content-checker': { readonly owner: PromptOwner };
  readonly 'retirement-checker': Readonly<Record<string, never>>;
  readonly session: {
    readonly persona: string;
    readonly skillCatalog: string | null;
    readonly owner: PromptOwner;
  };
  readonly compaction: {
    readonly owner: PromptOwner;
    readonly summary: { readonly words: number };
  };
}

export type PromptID = keyof PromptContexts;

interface PromptPart<Context> {
  readonly text: string;

  readonly isShown?: (context: Context) => boolean;
}

export interface PromptEntry<Context> {
  readonly paths: readonly string[];

  readonly buildValues: (context: Context) => Readonly<Record<string, string>>;

  readonly parts: Readonly<Record<string, PromptPart<Context>>>;

  readonly template: string;
}

export type PromptValues<Paths extends readonly string[]> = Readonly<Record<Paths[number], string>>;

export interface PromptOverride {
  readonly parts: Readonly<Record<string, string>>;
  readonly template: string | null;
}

export type PromptOverrides = Readonly<Partial<Record<PromptID, PromptOverride>>>;

export interface PromptsInForce {
  readonly snapshotHash: string;
  readonly personaVersion: string;
  readonly prompts: PromptOverrides;
}

export interface PromptPartFile {
  readonly path: string;
  readonly text: string;
}

export interface PromptProposalDraft {
  readonly id: string;
  readonly entry: Readonly<Record<string, string>>;
  readonly files: readonly PromptPartFile[];
}

export interface PromptProposalProblem {
  readonly path: string;
  readonly reason: string;
}

// modules/definitions owns the rules of the definitions parse and imports this module, so the
// server passes its check in.
export type CheckPromptProposal = (draft: PromptProposalDraft) => readonly PromptProposalProblem[];

export interface PromptToolsContext {
  readonly log: Log;
  readonly readInForce: () => PromptsInForce | null;
  readonly checkProposal: CheckPromptProposal;
}

export interface PromptAnswerContext extends ProposalContext {
  readonly readInForce: () => PromptsInForce | null;
  readonly checkProposal: CheckPromptProposal;
}

type PromptProposal = ReturnType<typeof promptsOverrideProposedCodec.decode>;

export interface PromptProposalState {
  readonly proposal: PromptProposal;
  readonly thread: string | null;
  readonly proposedAt: number;
  readonly outcome: ProposalOutcome | null;
}

export interface PendingPromptProposal {
  readonly proposal: PromptProposal;
  readonly thread: string | null;
  readonly proposedAt: number;
  readonly lapseAt: number;

  readonly isStale: boolean;
  readonly inForce: PromptOverride | null;
}

export type PromptProposalAnswer =
  | {
      readonly answer: 'approve';
      readonly proposalID: string;
      readonly proposalHash: string;
      readonly entry?: Readonly<Record<string, string>>;
      readonly files?: readonly PromptPartFile[];
    }
  | {
      readonly answer: 'reject';
      readonly proposalID: string;
      readonly proposalHash: string;
      readonly reason: string;
    };

export type PromptAnswerRefusalCode =
  | 'NOT_FOUND'
  | 'PROPOSAL_CLOSED'
  | 'PROPOSAL_HASH'
  | 'STALE_BASE'
  | 'PROMPT_CHECK';

export interface PromptAnswerRefusal {
  readonly status: 'refused';
  readonly proposalID: string;
  readonly code: PromptAnswerRefusalCode;
  readonly reason: string;

  readonly problems: readonly PromptProposalProblem[];
}

export type PromptProposalAnswerResult =
  | {
      readonly status: 'approved';
      readonly proposalID: string;
      readonly approvalID: string;
      readonly proposalHash: string;
    }
  | { readonly status: 'rejected'; readonly proposalID: string }
  | PromptAnswerRefusal;

export interface PromptProposalAnswerEvent {
  readonly proposalID: string;
  readonly promptID: PromptID;
  readonly outcome: ProposalOutcome;

  readonly isEdited: boolean;

  readonly reason: string | null;
}

export type PromptApprovalState = 'current' | 'superseded';

interface PromptApprovalRow {
  readonly approval_id: string;
  readonly proposal_id: string;
  readonly prompt_id: string;
  readonly thread: string | null;
  readonly entry: string;
  readonly files: string;
  readonly state: PromptApprovalState;
  readonly approved_at: number;
  readonly updated_at: number;
}

// Kysely's table map needs an index signature, which an interface lacks, so the tables are mapped
// types.
export type PromptsTables = CheckedTables<Readonly<{ prompt_approvals: PromptApprovalRow }>>;
