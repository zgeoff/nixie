// Memory gate: the types, the lists and the exact texts. Not compiled. No package imports this file.
// Usage: 01-usage.ts. Flows: 03-flow.ts. Where a doc and a sketch differ, the sketch wins for
// shapes and the doc wins for rules.
//
// Docs: memory-write-gate.md, memory-write-gate-labels.md, memory-task-tools.md,
// memory-task-delete.md. Open items: open/memory-gate.md, each marked here as (open: <name>).

// ---- A. The review reasons ----

// The closed list. `toReviewReason` reads a stored reason that is not in the list as 'other'.
const reviewReasons = [
  'no_quote',
  'quote_not_typed',
  'quote_in_quoted_block',
  'invisible_character',
  'token_missing',
  'checker_not_asserted',
  'checker_unsure',
  'checker_unreachable',
  'forgotten_evidence',
  'ambiguous_target',
  'pinned',
  'other',
  'self_note',
  'from_photo',
  'sensitive', // no write gets it; a stored proposal can hold it: memory-labels.md
  'subject_change',
  'labels', // a label-only edit: section C
] as const;

type ReviewReason = (typeof reviewReasons)[number];

function toReviewReason(stored: string): ReviewReason {
  return reviewReasons.find((reason) => reason === stored) ?? 'other';
}

// ---- B. The sentence of each review reason ----

// The words that a sentence takes. `owner` is your name from the definitions, or "the owner".
interface ReviewWords {
  owner: string;
  they: string;
  their: string;
  window: number; // the evidence window: `memory.evidence_window`
}

// formatWindow(1) is "last message"; formatWindow(n) is "last n messages".
const reasonSentences: Record<ReviewReason, (words: ReviewWords) => string> = {
  no_quote: (w) =>
    `The write gave no quote, or neither ${w.owner}'s ${formatWindow(w.window)} nor the message its eventID names contains it.`,
  quote_not_typed: (w) =>
    `The quote is in text ${w.owner} pasted or dropped in, or in a reply or tool result, not words ${w.they} typed.`,
  quote_in_quoted_block: () =>
    "The quote is inside a quoted block, so it may be someone else's words.",
  invisible_character: () => 'The new text or the quote contains a hidden character.',
  token_missing: (w) =>
    `The new text has a number, address, handle or link that isn't in the quote, or in what ${w.owner} typed in ${w.their} ${formatWindow(w.window)} when an allow rule skips the quote.`,
  checker_not_asserted: (w) => `${w.owner}'s words didn't clearly say this.`,
  checker_unsure: (w) => `It wasn't clear whether ${w.owner}'s words say this.`,
  checker_unreachable: () => "The check failed or didn't answer in time.",
  forgotten_evidence: (w) =>
    `The message you quoted backed a memory that ${w.owner} forgot, so it can't back a write again.`,
  ambiguous_target: () => "You haven't recalled this version of the item here.",
  pinned: (w) => `Pinned items always wait for ${w.their} review.`,
  other: () =>
    'A newer release of nixie sent it to review, for a reason this release does not name.',
  self_note: (w) =>
    `It's a self-note, which you write about yourself, and every self-note waits for ${w.their} review.`,
  from_photo: (w) =>
    `It comes from a photo, and a memory from a photo waits for ${w.their} review.`,
  sensitive: (w) => `It's marked sensitive, and a sensitive memory waits for ${w.their} review.`,
  subject_change: (w) =>
    `It changes whose fact the item is, and every subject change waits for ${w.their} review.`,
  labels: (w) =>
    `It changes how the item is listed or what brings it up, and every such change waits for ${w.their} review.`,
};

// ---- C. The result of a write tool for a proposal ----

// renderReviewReason(reason, gate): the model reads this as the tool's result.
const proposalResult = '{reason}: Saved as a proposal for {owner} to review. {sentence}';

// With the invented name Sam, the pronoun "their" and a label-only edit:
const labelsResult =
  'labels: Saved as a proposal for Sam to review. It changes how the item is listed or what brings it up, and every such change waits for their review.';

// The web review screen has one sentence of its own per reason, in `formatReviewReason`.
// (open: labels web text) its sentence for `labels`.

// ---- D. The gate's result and its checks ----

type Verdict = 'pass' | 'fail';

// What a gate returns. `checks` is stored with the proposal or the version.
type ContentGateResult =
  | { status: 'pass'; source: 'untrusted'; evidence: QuoteEvidence | null; checks: GateChecks }
  | {
      status: 'review';
      reason: ReviewReason;
      evidence: QuoteEvidence | null;
      checks: GateChecks;
      checkerReason: string | null;
    };

interface GateChecks {
  quote?: Verdict; // the evidence step and the quote check
  tokens?: Verdict; // the token check
  rule?: { id: string; revision: number }; // the allow rule that skipped the quote and the checker
  image?: ImageRef; // a write from a photo
  read?: Verdict; // a retire or an edit of a version that the caller has not recalled
}

// Where the typed quote sits in your message.
interface QuoteEvidence {
  recordSequence: number;
  start: number;
  end: number;
}

// The pattern of the hidden-character check: any Unicode format character.
const invisible = /\p{Cf}/u;

// ---- E. The request that the gate reads ----

interface WriteCaller {
  origin: 'conversation' | 'task'; // a stored record may also hold 'memory_writer': section K
  thread: string; // the caller's own thread: ToolRun.thread
  logThread: string; // the thread the caller may read: ToolRun.logThread, ../tasks/02-types.ts, L
  taskID: string;
  runID: string;
  model: string;
}

interface GatedRememberRequest {
  text: string;
  quote?: string;
  eventID?: number; // the tool input is a string, "#4127" or "4127"; the tool strips the "#"
  target?: VersionRef; // set for memory.edit
  subject?: 'owner' | 'shared' | 'self';
  until?: number | null;
  image?: ImageRef;
  labels?: WriteLabels; // the fields are in memory-labels.md
  caller: WriteCaller;
}

// The 3 labels of an item. memory-labels.md owns the fields, their limits and the label record.
interface WriteLabels {
  gist?: string;
  topic?: string;
  triggers?: string[];
}

// ---- F. The limits of the gate ----

interface GateLimits {
  evidenceWindow: number; // `memory.evidence_window`: how many of your last messages the gate reads
  proposalCap: number; // `memory.proposal_cap`, default 10: the proposals of one turn
  proposalLapseMs: number;
  closeMatchScore: number;
}

// ---- G. The errors of a write tool ----

// A refusal fails the tool call and writes nothing.
const selfNoteFromTask =
  'only the conversation writes a self-note, and this write came from the task';

const proposalCapReached = 'this turn already made {cap} memory proposals, the most it may make';

// ProposalCapError carries the code 'PROPOSAL_CAP'.

// ---- H. The memory tools of a task start ----

// The server splits the memory module's tools by effect. A tool that is not read-only is a
// write tool.
interface TaskStartBounds {
  memoryTools: {
    read: string[]; // memory.recall, memory.pending
    write: string[]; // memory.remember, memory.edit, memory.retire, memory.pin, memory.unpin,
    // each moment write tool, and memory.rate while the memory module registers it
  };
  conversationTools: string[];
}

// The reasons of a refused tool list. `memory_write_tools` is not a reason.
type ToolRefusalReason = 'wider_tools' | 'conversation_tools' | 'memory_tools';

// The 2 sentences that exist. {accepted} is the sentence of renderAcceptedTools.
const widerTools =
  'a task gets only tools you hold, and you do not hold {tools}, so nixie started nothing. {accepted}';

const memoryTools =
  'a task gets {tools} only with memory set to read, so nixie started nothing. {accepted}';

// (open: start refusal text) Which reason and which sentence a start gets when it names a write
// tool without `memory: read`, and when it names a write tool that its starter lacks. The 2
// sentences above are the nearest ones, and nothing settles that they are the answer.

// ---- I. The prompt IDs ----

// The prompts that exist. It feeds the manifest's schema, the `id` enum of the prompt write
// tool, the prompt read tool and the render. It holds neither 'writer' nor 'consolidator'.
const promptIDs = [/* the live IDs */] as const;

// The closed enum that parses stored data.
const storedPromptIDs = [...promptIDs, 'writer', 'consolidator'] as const;

// The 4 readers that parse with storedPromptIDs:
// 1. the schema of a `prompts.override_proposed` record;
// 2. and 3. the 2 readers of the prompt ID of a stored approval;
// 4. the stored definitions in force.

// (open: deleted prompt refusal) The one sentence of a refused approval for 'writer' or
// 'consolidator'. It states that the prompt is deleted.

// ---- J. The 2 leftover task IDs and the status procedures ----

const memoryWriterTaskID = 'memory-writer';
const memoryConsolidatorTaskID = 'memory-consolidator';

// Both procedures are marked deprecated, as `log.follow` is: `.route({ deprecated: true })`.
// memory.writerStatus: its output shape is the built one, read from the `memory_writer`
// projection, with isEnabled false.
// memory.consolidatorStatus:
interface ConsolidatorStatus {
  isEnabled: false;
}

// ---- K. Stored origins, and the words of each renderer ----

// The enums that parse a stored record hold 'memory_writer': the parsers of versions and
// proposals, the table's check, the export schema, and the API and host contracts.
type StoredProposalOrigin = 'conversation' | 'task' | 'memory_writer' | 'owner';

type StoredVersionOrigin = StoredProposalOrigin | 'lapse';

// The words for the origin 'memory_writer'. null: the renderer writes no origin words.
// (open: neutral event lines) the exact text of the 4 event lines.
const memoryWriterWords = {
  memoryLine: null, // renderMemoryLine
  pendingProposal: null, // the `memory.pending` tool; its description holds no "note-taker"
  proposalAnswer: 'a proposal', // buildProposalAnswerKind; the example of a neutral word
  proposalMerge: '(open: neutral event lines)', // buildProposalMergeKind
  catchUp: '(open: neutral event lines)', // buildCatchUpKind (open: stored event kinds)
  selfNoteFlag: '(open: neutral event lines)', // buildSelfNoteFlagKind (open: stored event kinds)
};

// The words of the other origins, as built:
const notedWords = {
  conversation: 'you noted it',
  task: 'a task noted it',
  lapse: 'its end time passed',
};

// ---- L. The 11 record kinds that only a built-in memory task wrote ----

const noteTakerKinds = [
  'memory.writer_started',
  'memory.batch_planned',
  'memory.batch_published',
  'memory.writer_failed',
  'memory.self_note_flagged',
] as const;

const consolidatorKinds = [
  'memory.consolidation_proposed',
  'memory.consolidation_summarized',
  'memory.consolidation_commented',
  'memory.consolidation_approved',
  'memory.consolidation_rejected',
  'memory.consolidation_lapsed',
] as const;

// nixie parses each kind and folds it: the `memory_writer` projection, and the 2 consolidation
// projections with the tables `memory_consolidations` and `memory_consolidation_changes`.
// No code writes a record of the first 10 kinds. The lapse sweep writes
// `memory.consolidation_lapsed` on the thread 'memory-consolidator'.
