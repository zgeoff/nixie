import type { Projection } from '@heynixie/log';
import { mcpToolListedCodec } from '../record/mcp-tool-listed-codec';
import type { McpTables } from './mcp-tables';

// One row per tool form a listing has held. The form stays in the record's erasable fields.
export const mcpToolFormsProjection: Projection = {
  table: 'mcp_tool_forms',
  keyColumn: 'hash',
  fold: async (tx, record) => {
    if (record.kind !== mcpToolListedCodec.kind) {
      return [];
    }

    const listed = mcpToolListedCodec.decode(record.payload);

    await tx
      .$extendTables<McpTables>()
      .insertInto('mcp_tool_forms')
      .values({ hash: listed.hash, listed_seq: record.sequence })
      .onConflict((conflict) => conflict.doNothing())
      .execute();

    return [listed.hash];
  },
};
