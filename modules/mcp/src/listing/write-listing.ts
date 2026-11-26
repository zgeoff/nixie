import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { readWithdrawals, writeMcpProposal } from '../proposal/write-mcp-proposal';
import { mcpNoticeCodec } from '../record/mcp-notice-codec';
import { mcpPinMovedCodec } from '../record/mcp-pin-moved-codec';
import { mcpToolChangedCodec } from '../record/mcp-tool-changed-codec';
import { mcpToolListedCodec } from '../record/mcp-tool-listed-codec';
import type { FoundForm } from '../rows/read-forms-by-hash';
import { readToolRows } from '../rows/read-tool-rows';
import type { McpContext, OnPinMoved } from '../types';
import { buildListingState } from './build-listing-state';
import { hasFormsOfPins } from './has-forms-of-pins';
import { planListing } from './plan-listing';
import type { ListingRequest, ToolPlan } from './plan-listing';

export interface ListingWriter {
  readonly context: McpContext;
  readonly onPinMoved?: OnPinMoved;
}

export type ListingWritten =
  | { readonly kind: 'written'; readonly plans: readonly ToolPlan[] }
  | { readonly kind: 'stale' };

// Plans the listing from the tool rows as the write transaction finds them, and writes what it owes
// there: each new tool form, allow proposal, pin move and changed tool row. A listing that changes
// nothing writes nothing. Stale when a pin moved to a form that the caller never read.
export function writeListing(
  writer: ListingWriter,
  request: ListingRequest,
  forms: ReadonlyMap<string, FoundForm>,
): Promise<ListingWritten> {
  return withWriteTransaction(writer.context.log.writer, async (tx): Promise<ListingWritten> => {
    const rows = await readToolRows(tx, request.serverID);

    if (!hasFormsOfPins(rows, forms)) {
      return { kind: 'stale' };
    }

    const plans = planListing(request, buildListingState(rows, forms));

    for (const plan of plans.filter((candidate) => candidate.isChanged || candidate.isListed)) {
      await writePlan(writer, tx, plan);
    }

    return { kind: 'written', plans };
  });
}

async function writePlan(
  writer: ListingWriter,
  tx: Transaction<unknown>,
  plan: ToolPlan,
): Promise<void> {
  const context = writer.context;
  const decision = plan.decision;
  const form = plan.form;

  const listed: RecordInput[] =
    plan.isListed && form !== null
      ? [
          {
            kind: mcpToolListedCodec.kind,
            definitions: context.definitions(),
            payload: mcpToolListedCodec.encode({
              serverID: plan.serverID,
              tool: plan.tool,
              hash: decision.latestHash,
            }),
            erasable: {
              form: {
                name: form.name,
                title: form.title,
                description: form.description,
                inputSchema: form.inputSchema,
                outputSchema: form.outputSchema,
                annotations: form.annotations,
              },
            },
          },
        ]
      : [];

  await writeRecordsInTransaction(tx, context.log, listed);

  if (!plan.isChanged) {
    return;
  }

  const proposalID = await writeAllowProposal(context, tx, plan);
  const withdrawals = await readWithdrawals(tx, context, plan.withdrawProposalID);

  const moved: RecordInput[] =
    decision.move === null
      ? []
      : [
          {
            kind: mcpPinMovedCodec.kind,
            definitions: context.definitions(),
            payload: mcpPinMovedCodec.encode({ tool: plan.tool, ...decision.move }),
          },
        ];

  await writeRecordsInTransaction(tx, context.log, [
    ...withdrawals,
    {
      kind: mcpToolChangedCodec.kind,
      definitions: context.definitions(),
      payload: mcpToolChangedCodec.encode({
        serverID: plan.serverID,
        tool: plan.tool,
        pinnedHash: decision.pinnedHash,
        latestHash: decision.latestHash,
        state: decision.state,
        hiddenReason: decision.hiddenReason,
        proposalID,
      }),
    },
    ...moved,
  ]);

  if (decision.notice !== null) {
    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: mcpNoticeCodec.kind,
        definitions: context.definitions(),
        payload: mcpNoticeCodec.encode({
          serverID: plan.serverID,
          tool: plan.tool,
          change: decision.notice.kind,
          fromHash: decision.notice.fromHash,
          toHash: decision.notice.toHash,
        }),
      },
    ]);
  }

  if (decision.move !== null) {
    await writer.onPinMoved?.(tx, { tool: plan.tool, ...decision.move });
  }
}

function writeAllowProposal(
  context: McpContext,
  tx: Transaction<unknown>,
  plan: ToolPlan,
): Promise<string | null> {
  if (plan.proposeAllow === null) {
    return Promise.resolve(plan.keptProposalID);
  }

  return writeMcpProposal(tx, context, {
    operation: {
      change: 'allow',
      tool: plan.tool,
      fromHash: plan.proposeAllow.fromHash,
      hash: plan.proposeAllow.hash,
    },
    replacesProposalID: plan.proposeAllow.replacesProposalID,
  });
}
