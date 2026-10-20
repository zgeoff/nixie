import type { ContractOutputs } from '@heynixie/contract';
import type { ReadonlyDeep } from '../types';
import { readMockPinnedCore } from './read-mock-pinned-core';
import { store } from './store';

export type MockProposalOutcome = ContractOutputs['memory']['approveProposals']['outcomes'][number];

interface MockAnswerBase {
  readonly clientActionID: string;
  readonly proposalID: string;
  readonly actionHash: string;

  // the device session that answers, which the approval or rejection record names
  readonly identityID: string;
}

export type MockProposalAnswer =
  | (MockAnswerBase & {
      readonly answer: 'approve';
      readonly editedText?: string | undefined;
      readonly ignoreCloseMatch?: boolean | undefined;
      readonly revisionOf?: { readonly itemID: string; readonly version: number } | undefined;
    })
  | (MockAnswerBase & { readonly answer: 'reject'; readonly reason?: string | undefined });

// Answers a memory proposal in the mock store as nixie's API does: once per client action ID, bound
// to the action hash the view showed, holding a new item for an active item with the same text.
// Each answer writes its own approval or rejection record, and a stale one writes nothing.
export async function writeMockProposalAnswer(
  input: MockProposalAnswer,
): Promise<MockProposalOutcome> {
  const bound = JSON.stringify(buildBinding(input));

  const earlier = store.memoryActions.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined) {
    return earlier.input === bound && earlier.result !== undefined
      ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- this function wrote the outcome
        (JSON.parse(earlier.result) as MockProposalOutcome)
      : { code: 'CLIENT_ACTION_ID_REUSED', proposalID: input.proposalID, status: 'refused' };
  }

  const outcome = await writeOpenAnswer(input);

  if (outcome.status === 'applied' || outcome.status === 'rejected') {
    await store.memoryActions.create({
      clientActionID: input.clientActionID,
      input: bound,
      result: JSON.stringify(outcome),
    });
  }

  return outcome;
}

// the input an answer binds to, with no free text, as nixie's API hashes it
function buildBinding(input: MockProposalAnswer) {
  return input.answer === 'reject'
    ? [input.answer, input.proposalID, input.actionHash, input.reason !== undefined]
    : [
        input.answer,
        input.proposalID,
        input.actionHash,
        input.editedText !== undefined,
        input.ignoreCloseMatch ?? null,
        input.revisionOf ?? null,
      ];
}

async function writeOpenAnswer(input: MockProposalAnswer): Promise<MockProposalOutcome> {
  const proposal = store.memoryProposals.findFirst((query) =>
    query.where({ proposalID: input.proposalID }),
  );

  const stale = findStaleCause(proposal, input.actionHash);

  if (proposal === undefined || stale !== null) {
    return { cause: stale ?? 'gone', proposalID: input.proposalID, status: 'stale' };
  }

  if (input.answer === 'reject') {
    await writeClosedProposal(proposal, {
      answer: 'rejected',
      identityID: input.identityID,
      proposalID: proposal.proposalID,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    });

    return { proposalID: proposal.proposalID, status: 'rejected' };
  }

  return writeApproval(proposal, input);
}

type StaleCause = Extract<MockProposalOutcome, { status: 'stale' }>['cause'];

type StoredProposal = ReadonlyDeep<NonNullable<ReturnType<typeof store.memoryProposals.findFirst>>>;

// why an answer to the proposal is stale, or null while it still takes one
function findStaleCause(
  proposal: StoredProposal | undefined,
  actionHash: string,
): StaleCause | null {
  if (proposal === undefined) {
    return 'gone';
  }

  if (proposal.status === 'lapsed' || proposal.lapseAt.getTime() <= Date.now()) {
    return 'lapsed';
  }

  if (proposal.status !== 'pending') {
    return 'answered';
  }

  if (proposal.actionHash !== actionHash) {
    return 'changed';
  }

  const item = store.memoryItems.findFirst((query) => query.where({ itemID: proposal.itemID }));

  return proposal.targetVersion !== null && item?.versions.length !== proposal.targetVersion
    ? 'moved'
    : null;
}

type Answer = ReadonlyDeep<NonNullable<ReturnType<typeof store.records.all>[number]['answer']>>;

// closes the proposal with the answer's own record in its thread
async function writeClosedProposal(proposal: StoredProposal, answer: Answer): Promise<void> {
  await store.memoryProposals.update((query) => query.where({ proposalID: proposal.proposalID }), {
    data(draft) {
      draft.status = answer.answer === 'rejected' ? 'rejected' : 'consumed';
    },
  });

  await store.records.create({
    answer,
    kind: answer.answer === 'rejected' ? 'memory.proposal_rejected' : 'memory.approval_recorded',
    thread: proposal.thread,
  });
}

type ApprovalInput = Extract<MockProposalAnswer, { answer: 'approve' }>;

async function writeApproval(
  proposal: StoredProposal,
  input: ApprovalInput,
): Promise<MockProposalOutcome> {
  const refusal = findApprovalRefusal(proposal, input);

  if (refusal !== null) {
    return refusal;
  }

  const text = input.editedText ?? proposal.text;
  const match = readCloseMatch(proposal, input, text);

  if (match !== null) {
    return { item: match, proposalID: proposal.proposalID, status: 'close_match' };
  }

  const itemID = input.revisionOf?.itemID ?? proposal.itemID;
  const item = store.memoryItems.findFirst((query) => query.where({ itemID }));
  const state = pickVersionState(proposal, input, item);
  const isPinned = proposal.isPinned || item?.isPinned === true;

  if (state === 'active' && isPinned && !probeCoreRoom(itemID, text)) {
    return { code: 'PINNED_CORE_FULL', proposalID: proposal.proposalID, status: 'refused' };
  }

  await applyApproval(proposal, input, { itemID, state, text });

  await writeClosedProposal(proposal, {
    answer: input.editedText === undefined ? 'approved' : 'edited',
    identityID: input.identityID,
    proposalID: proposal.proposalID,
  });

  return { proposalID: proposal.proposalID, status: 'applied' };
}

// what stops an approval before it writes, as nixie's store checks it: a retirement takes no edit,
// and only a new item's proposal takes a revision target, of an item of its own subject
function findApprovalRefusal(
  proposal: StoredProposal,
  input: ApprovalInput,
): MockProposalOutcome | null {
  if (proposal.operation === 'retire' && input.editedText !== undefined) {
    return { code: 'RETIREMENT_EDIT', proposalID: proposal.proposalID, status: 'refused' };
  }

  if (input.revisionOf === undefined) {
    return null;
  }

  return proposal.targetVersion === null
    ? findRevisionTargetRefusal(proposal, input.revisionOf)
    : { code: 'REVISION_TARGET', proposalID: proposal.proposalID, status: 'refused' };
}

// a revision binds to the version of the close match the view showed, which must still be active
// or retired, and of the proposal's subject, which nixie's API answers as a revision target it
// refuses; a pinned proposal's revision must also leave the item active
function findRevisionTargetRefusal(
  proposal: StoredProposal,
  target: NonNullable<ApprovalInput['revisionOf']>,
): MockProposalOutcome | null {
  const proposalID = proposal.proposalID;
  const item = store.memoryItems.findFirst((query) => query.where({ itemID: target.itemID }));

  if (item === undefined || item.state === 'forgetting' || item.state === 'forgotten') {
    return { cause: 'gone', proposalID, status: 'stale' };
  }

  if (item.versions.length !== target.version) {
    return { cause: 'moved', proposalID, status: 'stale' };
  }

  if (item.subject !== proposal.subject) {
    return { code: 'REVISION_TARGET', proposalID, status: 'refused' };
  }

  // a revision keeps a retired item retired, and only an active item joins the pinned core
  return item.state === 'retired' && proposal.isPinned
    ? { code: 'WRONG_STATE', proposalID, status: 'refused' }
    : null;
}

// the active item of the proposal's subject a new item's text matches, case aside, unless the answer
// already chose
function readCloseMatch(proposal: StoredProposal, input: ApprovalInput, text: string) {
  if (
    proposal.targetVersion !== null ||
    input.revisionOf !== undefined ||
    input.ignoreCloseMatch === true
  ) {
    return null;
  }

  const item = store.memoryItems.findFirst((query) =>
    query.where(
      (stored) =>
        stored.state === 'active' &&
        stored.subject === proposal.subject &&
        stored.versions.at(-1)?.text.toLowerCase() === text.toLowerCase(),
    ),
  );

  const current = item?.versions.at(-1);

  return item === undefined || current === undefined
    ? null
    : { itemID: item.itemID, text: current.text, version: item.versions.length };
}

type StoredItem = ReadonlyDeep<NonNullable<ReturnType<typeof store.memoryItems.findFirst>>>;

type VersionState = 'active' | 'retired';

// the state the approved version takes: a retirement retires the item, and a revision keeps the
// state of the item it revises, as nixie's store plans it
function pickVersionState(
  proposal: StoredProposal,
  input: ApprovalInput,
  item: StoredItem | undefined,
): VersionState {
  if (proposal.operation === 'retire') {
    return 'retired';
  }

  return input.revisionOf !== undefined && item?.state === 'retired' ? 'retired' : 'active';
}

// whether the pinned core stays inside its budget once the item's text is the given text, where
// the item's earlier version leaves the count, as nixie's store checks it
function probeCoreRoom(itemID: string, text: string): boolean {
  const core = readMockPinnedCore();
  const earlier = core.items.find((item) => item.itemID === itemID)?.text ?? '';

  return core.tokens - Math.ceil(earlier.length / 4) + Math.ceil(text.length / 4) <= core.budget;
}

interface ApprovedVersion {
  readonly itemID: string;
  readonly state: VersionState;
  readonly text: string;
}

// adds the version the approval applies: a new item, a revision of a close match, or the change
// the proposal binds to
async function applyApproval(
  proposal: StoredProposal,
  input: ApprovalInput,
  approved: ApprovedVersion,
): Promise<void> {
  const itemID = approved.itemID;
  const isEdited = input.editedText !== undefined;

  const version = {
    origin: isEdited ? ('owner' as const) : proposal.origin,
    proposalID: proposal.proposalID,
    source: isEdited ? ('owner' as const) : proposal.source,
    state: approved.state,
    text: approved.text,
  };

  const item = store.memoryItems.findFirst((query) => query.where({ itemID }));

  if (item === undefined) {
    await store.memoryItems.create({
      isPinned: proposal.isPinned,
      itemID,
      subject: proposal.subject,
      versions: [version],
    });

    return;
  }

  await store.memoryItems.update((query) => query.where({ itemID }), {
    data(draft) {
      draft.versions.push({
        ...version,
        change: proposal.operation === 'retire' ? 'retired' : 'edited',
        checkerModel: null,
        checks: null,
        evidence: null,
        evidenceQuote: null,
        isUnreadable: false,
        recordedAt: new Date(),
        taskID: null,
        writerModel: null,
      });

      draft.state = version.state;
    },
  });
}
