import invariant from 'tiny-invariant';
import { hashToolForm } from '../pin/hash-tool-form';
import type { McpContext, OnPinMoved } from '../types';
import type { ListingRequest, ToolPlan } from './plan-listing';
import { readListingForms } from './read-listing-forms';
import { writeListing } from './write-listing';

export interface ListingApplication {
  readonly context: McpContext;
  readonly onPinMoved?: OnPinMoved;

  // runs after the forms are read and before the write transaction opens
  readonly afterRead?: () => Promise<void>;
}

const maxAttempts = 3;

// Applies a server listing that passed: reads the forms the pins name, then decides each tool's pin
// from the rows as the write transaction finds them, so it never overwrites an allow that committed
// in between. Returns the plans.
export async function applyListing(
  application: ListingApplication,
  request: ListingRequest,
): Promise<readonly ToolPlan[]> {
  const hashes = request.forms.map((form) => hashToolForm(form));

  for (let attempt = 1; ; attempt += 1) {
    const forms = await readListingForms(application.context.log, {
      serverID: request.serverID,
      hashes,
    });

    await application.afterRead?.();

    const written = await writeListing(
      {
        context: application.context,
        ...(application.onPinMoved === undefined ? {} : { onPinMoved: application.onPinMoved }),
      },
      request,
      forms,
    );

    if (written.kind === 'written') {
      return written.plans;
    }

    invariant(
      attempt < maxAttempts,
      'a pin moves to a form that the listing read only when another listing ran',
    );
  }
}
