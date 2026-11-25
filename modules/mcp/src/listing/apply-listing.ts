import { hashToolForm } from '../pin/hash-tool-form';
import type { McpContext, OnPinMoved } from '../types';
import { planListing } from './plan-listing';
import type { ListingRequest, ToolPlan } from './plan-listing';
import { readListingState } from './read-listing-state';
import { writeListing } from './write-listing';

export interface ListingApplication {
  readonly context: McpContext;
  readonly onPinMoved?: OnPinMoved;
}

// Applies a server listing that passed: reads the rows it compares with, decides each tool's pin,
// and writes what changed. Returns the plans, so a caller can see each tool's new state.
export async function applyListing(
  application: ListingApplication,
  request: ListingRequest,
): Promise<readonly ToolPlan[]> {
  const state = await readListingState(application.context.log, {
    serverID: request.serverID,
    hashes: request.forms.map((form) => hashToolForm(form)),
  });

  const plans = planListing(request, state);

  await writeListing(
    {
      context: application.context,
      ...(application.onPinMoved === undefined ? {} : { onPinMoved: application.onPinMoved }),
    },
    plans,
  );

  return plans;
}
