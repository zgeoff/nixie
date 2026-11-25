import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { readWithdrawals, writeMcpProposal } from '../proposal/write-mcp-proposal';
import { mcpPinMovedCodec } from '../record/mcp-pin-moved-codec';
import { mcpToolChangedCodec } from '../record/mcp-tool-changed-codec';
import { mcpToolListedCodec } from '../record/mcp-tool-listed-codec';
import type { McpContext, OnPinMoved } from '../types';
import type { ToolPlan } from './plan-listing';

export interface ListingWriter {
  readonly context: McpContext;
  readonly onPinMoved?: OnPinMoved;
}

// Writes what a listing owes, in one transaction: a record for each new tool form, one allow
// proposal for each tool that needs one, each pin move and each tool row that changes. A listing
// that changes nothing writes nothing.
export async function writeListing(
  writer: ListingWriter,
  plans: readonly ToolPlan[],
): Promise<void> {
  const owed = plans.filter((plan) => plan.isChanged || plan.isListed);

  if (owed.length === 0) {
    return;
  }

  await withWriteTransaction(writer.context.log.writer, async (tx) => {
    for (const plan of owed) {
      await writePlan(writer, tx, plan);
    }
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
