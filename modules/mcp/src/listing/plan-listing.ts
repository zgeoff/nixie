import { toSDKToolName } from '@heynixie/tools';
import { buildProxiedToolName, pickNameRefusal } from '../name/pick-name-refusal';
import { decideMissingPin, decidePin } from '../pin/decide-pin';
import type { PinDecision } from '../pin/decide-pin';
import { hashToolForm } from '../pin/hash-tool-form';
import { pickFormRefusal } from '../registry/pick-form-refusal';
import type { ToolForm } from '../types';
import type { ListingState } from './types';

export interface ListingRequest {
  readonly serverID: string;
  readonly isTrusted: boolean;

  // the tools of the newest passed listing
  readonly forms: readonly ToolForm[];

  // the model names that nixie's own tools hold
  readonly takenModelNames: ReadonlySet<string>;
}

// What one listing owes one tool.
export interface ToolPlan {
  readonly tool: string;
  readonly serverID: string;

  // null for a tool that the listing no longer holds
  readonly form: ToolForm | null;
  readonly decision: PinDecision;

  // whether to write `mcp.tool_listed`, because no readable form holds the hash
  readonly isListed: boolean;

  // an allow proposal to write, and the open proposal it replaces
  readonly proposeAllow: {
    readonly fromHash: string | null;
    readonly hash: string;
    readonly replacesProposalID: string | null;
  } | null;

  // an open proposal that the listing makes moot
  readonly withdrawProposalID: string | null;

  // the proposal that the row keeps when this plan writes no new one
  readonly keptProposalID: string | null;

  // whether the tool's row changes
  readonly isChanged: boolean;
}

// Decides what a listing that passed does to every tool the server has held. It writes nothing: a
// listing that changes nothing owes no record.
export function planListing(request: ListingRequest, state: ListingState): ToolPlan[] {
  const taken = new Set(request.takenModelNames);

  const forms = pickFirstOfEachName(request.forms);

  const names = new Set(forms.map((form) => form.name));

  const listed = forms.map((form) => planListedTool(request, state, taken, form));

  const missing = [...state.rows.values()]
    .filter(
      (row) => !names.has(row.tool.slice(request.serverID.length + 1)) && row.state !== 'removed',
    )
    .map((row): ToolPlan => {
      const decision = decideMissingPin({
        pinnedHash: row.pinned_hash,
        latestHash: row.latest_hash,
        state: row.state,
      });

      return {
        tool: row.tool,
        serverID: request.serverID,
        form: null,
        decision,
        isListed: false,
        proposeAllow: null,
        withdrawProposalID: row.proposal_id,
        keptProposalID: null,
        isChanged: true,
      };
    });

  return [...listed, ...missing];
}

// The tools in the order of their names, with one tool for each name: the first one a server lists.
function pickFirstOfEachName(forms: readonly ToolForm[]): ToolForm[] {
  const byName = new Map<string, ToolForm>();

  for (const form of forms) {
    if (!byName.has(form.name)) {
      byName.set(form.name, form);
    }
  }

  return [...byName.values()].toSorted((first, second) => first.name.localeCompare(second.name));
}

function planListedTool(
  request: ListingRequest,
  state: ListingState,
  taken: Set<string>,
  form: ToolForm,
): ToolPlan {
  const tool = buildProxiedToolName(request.serverID, form.name);
  const hash = hashToolForm(form);
  const row = state.rows.get(tool);

  const refusal =
    pickNameRefusal({
      serverID: request.serverID,
      toolName: form.name,
      takenModelNames: taken,
    }) ?? pickFormRefusal(tool, form);

  if (refusal === null) {
    taken.add(toSDKToolName(tool));
  }

  const decision = decidePin({
    isTrusted: request.isTrusted,
    existing:
      row === undefined
        ? null
        : { pinnedHash: row.pinned_hash, latestHash: row.latest_hash, state: row.state },
    pinnedForm: state.pinnedForms.get(tool) ?? null,
    form,
    hash,
    nameRefusal: refusal,
  });

  const isNewForm =
    decision.propose !== null &&
    (row === undefined || row.latest_hash !== decision.latestHash || row.state !== decision.state);

  const proposeAllow =
    decision.propose === null || !isNewForm
      ? null
      : { ...decision.propose, replacesProposalID: row?.proposal_id ?? null };

  // an allow waits only on a form the owner could pin: an exposed tool or a refused form has none
  const isMoot =
    (decision.state === 'exposed' || decision.hiddenReason !== null) &&
    (row?.proposal_id ?? null) !== null;

  const withdrawProposalID = isMoot ? (row?.proposal_id ?? null) : null;

  return {
    tool,
    serverID: request.serverID,
    form,
    decision,
    isListed: state.formStatuses.get(hash) !== 'readable',
    proposeAllow,
    withdrawProposalID,
    keptProposalID: isMoot ? null : (row?.proposal_id ?? null),
    isChanged:
      row === undefined ||
      row.pinned_hash !== decision.pinnedHash ||
      row.latest_hash !== decision.latestHash ||
      row.state !== decision.state ||
      row.hidden_reason !== decision.hiddenReason ||
      proposeAllow !== null ||
      withdrawProposalID !== null,
  };
}
