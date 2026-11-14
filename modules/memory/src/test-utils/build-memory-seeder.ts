import type { MemorySeederDeps } from './memory-seeder-deps';
import { seedConsumedProposal } from './seed-consumed-proposal';
import { seedForgettingMemoryItem } from './seed-forgetting-memory-item';
import { seedForgottenMemoryItem } from './seed-forgotten-memory-item';
import { seedLapsedProposal } from './seed-lapsed-proposal';
import { seedMemoryItem } from './seed-memory-item';
import { seedMemoryItemWithoutShortID } from './seed-memory-item-without-short-id';
import { seedProposal } from './seed-proposal';
import { seedProposalWithLaterReason } from './seed-proposal-with-later-reason';
import { seedRejectedProposal } from './seed-rejected-proposal';
import { seedRetiredMemoryItem } from './seed-retired-memory-item';

export function buildMemorySeeder(deps: MemorySeederDeps) {
  return {
    item: (input?: Parameters<typeof seedMemoryItem>[1]) => seedMemoryItem(deps, input),
    retiredItem: (input?: Parameters<typeof seedRetiredMemoryItem>[1]) =>
      seedRetiredMemoryItem(deps, input),
    forgettingItem: (input?: Parameters<typeof seedForgettingMemoryItem>[1]) =>
      seedForgettingMemoryItem(deps, input),
    forgottenItem: (input?: Parameters<typeof seedForgottenMemoryItem>[1]) =>
      seedForgottenMemoryItem(deps, input),
    itemWithoutShortID: (input?: Parameters<typeof seedMemoryItemWithoutShortID>[1]) =>
      seedMemoryItemWithoutShortID(deps, input),
    proposal: (input?: Parameters<typeof seedProposal>[1]) => seedProposal(deps, input),
    consumedProposal: (input?: Parameters<typeof seedConsumedProposal>[1]) =>
      seedConsumedProposal(deps, input),
    rejectedProposal: (input?: Parameters<typeof seedRejectedProposal>[1]) =>
      seedRejectedProposal(deps, input),
    lapsedProposal: (input?: Parameters<typeof seedLapsedProposal>[1]) =>
      seedLapsedProposal(deps, input),
    proposalWithLaterReason: (input?: Parameters<typeof seedProposalWithLaterReason>[1]) =>
      seedProposalWithLaterReason(deps, input),
  };
}
