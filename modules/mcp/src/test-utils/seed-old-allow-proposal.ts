import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { hashToolForm } from '../pin/hash-tool-form';
import { writeMcpProposal } from '../proposal/write-mcp-proposal';
import { mcpToolChangedCodec } from '../record/mcp-tool-changed-codec';
import { mcpToolListedCodec } from '../record/mcp-tool-listed-codec';
import type { McpContext, ToolForm } from '../types';

// A waiting allow for a tool form that a listing now keeps hidden, as an older listing wrote it.
// The module cannot make this state any more, so the seed writes its records. Returns the proposal's
// ID.
export function seedOldAllowProposal(
  context: McpContext,
  serverID: string,
  form: ToolForm,
): Promise<string> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const hash = hashToolForm(form);
    const tool = `${serverID}.${form.name}`;
    const definitions = context.definitions();

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: mcpToolListedCodec.kind,
        definitions,
        payload: mcpToolListedCodec.encode({ serverID, tool, hash }),
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
    ]);

    const proposalID = await writeMcpProposal(tx, context, {
      operation: { change: 'allow', tool, fromHash: null, hash },
      replacesProposalID: null,
    });

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: mcpToolChangedCodec.kind,
        definitions,
        payload: mcpToolChangedCodec.encode({
          serverID,
          tool,
          pinnedHash: null,
          latestHash: hash,
          state: 'hidden_new',
          hiddenReason: null,
          proposalID,
        }),
      },
    ]);

    return proposalID;
  });
}
