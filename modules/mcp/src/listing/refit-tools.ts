import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { pickFitFault } from '../declaration/pick-fit-fault';
import { mcpToolChangedCodec } from '../record/mcp-tool-changed-codec';
import { readFormsByHash } from '../rows/read-forms-by-hash';
import { readToolRows } from '../rows/read-tool-rows';
import type { McpContext, ReadOverrides } from '../types';

// Judges again whether each pinned tool fits the override of the definitions in force, which a seed
// may have changed since the last listing. It writes a record only for a tool whose state changes.
export function refitTools(context: McpContext, readOverrides: ReadOverrides): Promise<number> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const rows = await readToolRows(tx);

    const candidates = rows.filter(
      (row) =>
        row.pinned_hash !== null && (row.state === 'exposed' || row.state === 'stopped_unfit'),
    );

    if (candidates.length === 0) {
      return 0;
    }

    const inForce = await readOverrides(tx);

    const forms = await readFormsByHash(
      { deploymentKey: context.log.deploymentKey, writer: { ...context.log.writer, db: tx } },
      candidates.flatMap((row) => row.pinned_hash ?? []),
    );

    const changes = candidates.flatMap((row): RecordInput[] => {
      const form = forms.get(row.pinned_hash ?? '')?.form ?? null;
      const override = form === null ? undefined : inForce.servers[row.server_id]?.[form.name];

      const names = new Set(
        rows
          .filter((other) => other.server_id === row.server_id && other.state !== 'removed')
          .map((other) => other.tool.slice(row.server_id.length + 1)),
      );

      const fault =
        form === null || override === undefined ? null : pickFitFault(override, form, names);

      const state = fault === null ? 'exposed' : 'stopped_unfit';

      if (state === row.state && fault === row.hidden_reason) {
        return [];
      }

      return [
        {
          kind: mcpToolChangedCodec.kind,
          definitions: context.definitions(),
          payload: mcpToolChangedCodec.encode({
            serverID: row.server_id,
            tool: row.tool,
            pinnedHash: row.pinned_hash,
            latestHash: row.latest_hash,
            state,
            hiddenReason: fault,
            proposalID: row.proposal_id,
          }),
        },
      ];
    });

    await writeRecordsInTransaction(tx, context.log, changes);

    return changes.length;
  });
}
