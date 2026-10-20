import type { Clock } from '@heynixie/clock';
import type { DefinitionsInForce, SkillOrigin } from '@heynixie/definitions';
import type { Definitions, Log } from '@heynixie/log';
import type { ToolRun } from '@heynixie/tools';
import type { skillsWriteProposedCodec } from './skills-write-proposed-codec';

// What the skill tools reach: the log the pins and the proposals live in, the clock a proposal's
// age and lapse run on, the definitions in force, a fresh seed, and each caller's skill list.
export interface SkillToolsContext {
  readonly log: Log;
  readonly clock: Pick<Clock, 'now'>;
  readonly readInForce: () => DefinitionsInForce | null;

  // takes a fresh snapshot, seeds it when its revision is new, and returns the definitions then in
  // force, or the last ones when the source refused the snapshot
  readonly refreshDefinitions: () => Promise<DefinitionsInForce | null>;

  // the names on the run's skill list in the given definitions
  readonly readSkillList: (run: ToolRun, inForce: DefinitionsInForce | null) => readonly string[];
}

// A skill proposal as its record holds it.
type SkillProposal = ReturnType<typeof skillsWriteProposedCodec.decode>;

// How a skill proposal closed: your approval or rejection, or its lapse with no answer.
export type SkillProposalOutcome = 'approved' | 'rejected' | 'lapsed';

// Where a skill proposal stands: pending until a record closes it with its outcome.
export type SkillProposalStatus = 'pending' | SkillProposalOutcome;

// A skill proposal with the thread and the time it was proposed, and how it closed, or null while
// it waits for your answer.
export interface SkillProposalState {
  readonly proposal: SkillProposal;
  readonly thread: string | null;
  readonly proposedAt: number;
  readonly outcome: SkillProposalOutcome | null;
}

// What the review of skill proposals reaches: the log the records live in, the clock their lapse
// time runs on, and the definitions in force, which each answer's record carries.
export interface SkillProposalContext {
  readonly log: Log;
  readonly clock: Pick<Clock, 'now'>;
  readonly definitions: () => Definitions;
}

// One file of a skill, by its path inside the skill's folder.
interface SkillFile {
  readonly path: string;
  readonly text: string;
}

// A skill proposal that waits for your answer, with its lapse time and the version of the skill in
// force now, which the review diffs each file against, or null when none is in force. A vendored
// version comes from skills.lock.json, so a new version of it replaces the vendored copy.
export interface PendingSkillProposal {
  readonly proposal: SkillProposal;
  readonly thread: string | null;
  readonly proposedAt: number;
  readonly lapseAt: number;
  readonly inForce: {
    readonly skillHash: string;
    readonly origin: SkillOrigin;
    readonly files: readonly SkillFile[];
  } | null;
}

// Your answer to a skill proposal, bound to the skill hash the review showed: an approval names the
// pull request that carries the skill, and a rejection gives the reason the conversation reads.
export type SkillProposalAnswer =
  | {
      readonly answer: 'approve';
      readonly proposalID: string;
      readonly skillHash: string;
      readonly pullRequestURL: string;
    }
  | {
      readonly answer: 'reject';
      readonly proposalID: string;
      readonly skillHash: string;
      readonly reason: string;
    };
