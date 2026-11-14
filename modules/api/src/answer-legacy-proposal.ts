import type { AnswerSettlement, ProposalFamily } from '@heynixie/proposals';
import { answerProposal } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import type { ProposalAPIContext } from './build-proposal-core-deps';
import { buildProposalCoreDeps } from './build-proposal-core-deps';

// A device route checks its caller's session again inside the answer's transaction. A host route
// has no session, and passes no caller.
export interface LegacyCaller {
  readonly probe: (tx: Transaction<unknown>) => Promise<boolean>;
  readonly buildUnauthorized: () => Error;
}

export interface LegacyParts {
  readonly runInForceSeed: () => Promise<unknown>;
  readonly caller?: LegacyCaller;
}

export interface LegacyAnswer {
  readonly proposalID: string;

  // the hash that the route binds the answer to, when it has one
  readonly actionHash?: string;
  readonly choice: 'approve' | 'decline';
  readonly note?: string;
  readonly files?: readonly { readonly path: string; readonly text: string }[];
}

// The routes that predate the approvals namespace answer through the same checks, for one kind,
// with no client action ID.
export async function answerLegacyProposal(
  context: ProposalAPIContext,
  parts: LegacyParts,
  family: ProposalFamily,
  answer: LegacyAnswer,
): Promise<AnswerSettlement> {
  const deps = buildProposalCoreDeps(context, {
    readMemory: () => null,
    runInForceSeed: parts.runInForceSeed,
  });

  const hooks =
    parts.caller === undefined ? { family } : { family, probeCaller: parts.caller.probe };

  const outcome = await answerProposal(
    deps,
    {
      proposalID: answer.proposalID,
      actionHash: answer.actionHash ?? null,
      choice: answer.choice,
      ...(answer.note === undefined ? {} : { note: answer.note }),
      ...(answer.files === undefined ? {} : { files: answer.files }),
      identityID: 'owner',
    },
    hooks,
  );

  if (outcome.status === 'unauthorized') {
    invariant(parts.caller, 'only a route with a caller checks it');
    throw parts.caller.buildUnauthorized();
  }

  return outcome;
}
