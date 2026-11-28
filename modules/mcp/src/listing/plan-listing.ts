import type { McpToolOverride } from '@heynixie/policy';
import { toSDKToolName } from '@heynixie/tools';
import { buildMissingToolFault } from '../declaration/build-missing-tool-fault';
import { buildProxiedToolName, pickNameRefusal } from '../name/pick-name-refusal';
import { decideMissingPin, decidePin } from '../pin/decide-pin';
import type { PinDecision } from '../pin/decide-pin';
import { hashToolForm } from '../pin/hash-tool-form';
import { pickFormRefusal } from '../registry/pick-form-refusal';
import type { McpToolRow } from '../rows/mcp-tables';
import type { ToolForm } from '../types';
import type { ListingState } from './types';

export interface ListingRequest {
  readonly serverID: string;

  // the tools of the newest passed listing
  readonly forms: readonly ToolForm[];

  // the model names that nixie's own tools hold
  readonly takenModelNames: ReadonlySet<string>;

  // the server's override file, by the tool's own name; absent when the definitions hold none
  readonly overrides?: Readonly<Record<string, McpToolOverride>>;
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

  const forms = request.forms.toSorted((first, second) => first.name.localeCompare(second.name));

  const names = new Set(forms.map((form) => form.name));

  const listed = forms.map((form) => planListedTool(request, state, taken, { form, names }));

  const isOverridden = (name: string): boolean =>
    request.overrides !== undefined && Object.hasOwn(request.overrides, name);

  const missing = [...state.rows.values()]
    .filter((row) => !names.has(toServerName(request, row.tool)))
    .flatMap((row): ToolPlan[] => {
      const name = toServerName(request, row.tool);

      // a file that names a tool the server lacks stops it, whether or not it was pinned
      if (isOverridden(name)) {
        return [planUnfitMissing(request, name, row)];
      }

      if (row.state === 'removed') {
        return [];
      }

      const decision = decideMissingPin({
        pinnedHash: row.pinned_hash,
        latestHash: row.latest_hash,
        state: row.state,
      });

      return [
        {
          tool: row.tool,
          serverID: request.serverID,
          form: null,
          decision,
          isListed: false,
          proposeAllow: null,
          withdrawProposalID: row.proposal_id,
          keptProposalID: null,
          isChanged: true,
        },
      ];
    });

  const unheld = Object.keys(request.overrides ?? {})
    .filter(
      (name) => !names.has(name) && !state.rows.has(buildProxiedToolName(request.serverID, name)),
    )
    .map((name) => planUnfitMissing(request, name, undefined));

  return [...listed, ...missing, ...unheld];
}

interface ListedTool {
  readonly form: ToolForm;

  // the names of every tool the listing holds
  readonly names: ReadonlySet<string>;
}

function planListedTool(
  request: ListingRequest,
  state: ListingState,
  taken: Set<string>,
  listed: ListedTool,
): ToolPlan {
  const form = listed.form;
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
    existing:
      row === undefined
        ? null
        : { pinnedHash: row.pinned_hash, latestHash: row.latest_hash, state: row.state },
    pinnedForm: state.pinnedForms.get(tool) ?? null,
    form,
    hash,
    nameRefusal: refusal,
    override: findOwnOverride(request.overrides, form.name),
    serverToolNames: listed.names,
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

function findOwnOverride(
  overrides: Readonly<Record<string, McpToolOverride>> | undefined,
  name: string,
): McpToolOverride | null {
  return overrides !== undefined && Object.hasOwn(overrides, name)
    ? (overrides[name] ?? null)
    : null;
}

function toServerName(request: ListingRequest, tool: string): string {
  return tool.slice(request.serverID.length + 1);
}

// The plan for a tool that the override names and the listing lacks. The tool keeps its pin, if it
// had one, and waits stopped until the override or the server changes.
function planUnfitMissing(
  request: ListingRequest,
  name: string,
  row: McpToolRow | undefined,
): ToolPlan {
  const hiddenReason = buildMissingToolFault(name);

  const decision: PinDecision = {
    state: 'stopped_unfit',
    pinnedHash: row?.pinned_hash ?? null,
    latestHash: row?.latest_hash ?? '',
    move: null,
    propose: null,
    notice: null,
    hiddenReason,
  };

  const isMoot = (row?.proposal_id ?? null) !== null;

  return {
    tool: buildProxiedToolName(request.serverID, name),
    serverID: request.serverID,
    form: null,
    decision,
    isListed: false,
    proposeAllow: null,
    withdrawProposalID: row?.proposal_id ?? null,
    keptProposalID: null,
    isChanged:
      row === undefined ||
      row.state !== 'stopped_unfit' ||
      row.hidden_reason !== hiddenReason ||
      isMoot,
  };
}
