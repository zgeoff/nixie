import type { Log, LogTables } from '@heynixie/log';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { z } from 'zod';
import { codeRunToolName } from './code-run-tool-name';
import { destroyCodeRunSandboxes } from './destroy-code-run-sandboxes';

export interface CodeRunCleanup {
  // destroys the code sandboxes of the tool calls that the records name
  readonly destroyForRecords: (sequences: readonly number[]) => Promise<void>;

  // destroys the code sandboxes of every tool call on the thread
  readonly destroyForThread: (thread: string) => Promise<void>;
}

const callPayloadSchema = z.object({ callID: z.string(), tool: z.string().optional() });

// The cleanup that a forget runs before it deletes any key that seals a tool call or a tool result.
export function makeCodeRunCleanup(
  log: Pick<Log, 'writer'>,
  adapter: Pick<SandboxAdapter, 'list'>,
): CodeRunCleanup {
  const read = () =>
    log.writer.db
      .$extendTables<LogTables>()
      .selectFrom('records')
      .select('payload')
      .where('kind', 'in', ['tool_called', 'tool_result']);

  return {
    destroyForRecords: async (sequences) => {
      if (sequences.length === 0) {
        return;
      }

      const rows = await read().where('sequence', 'in', sequences).execute();

      await destroyCodeRunSandboxes(adapter, collectCallIDs(rows));
    },
    destroyForThread: async (thread) => {
      // only a code call can own a code sandbox, and a thread holds far more calls of other tools
      const rows = await read()
        .where('thread', '=', thread)
        .where('kind', '=', 'tool_called')
        .execute();

      const codeRows = rows.filter(
        (row) => callPayloadSchema.parse(JSON.parse(row.payload)).tool === codeRunToolName,
      );

      await destroyCodeRunSandboxes(adapter, collectCallIDs(codeRows));
    },
  };
}

function collectCallIDs(rows: readonly { readonly payload: string }[]): readonly string[] {
  const ids = rows.flatMap((row) => {
    const payload = callPayloadSchema.safeParse(JSON.parse(row.payload));

    return payload.success ? [payload.data.callID] : [];
  });

  return [...new Set(ids)];
}
