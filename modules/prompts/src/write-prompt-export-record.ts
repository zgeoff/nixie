import type { Definitions, Log } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { promptsOverrideExportedCodec } from './prompts-override-exported-codec';
import type { PromptsTables } from './types';

export interface PromptExport {
  readonly approvalID: string;
  readonly pullRequestURL: string;
  readonly definitions: Definitions;
}

export async function writePromptExportRecord(
  tx: Transaction<unknown>,
  log: Log,
  promptExport: PromptExport,
): Promise<void> {
  const approval = await tx
    .$extendTables<PromptsTables>()
    .selectFrom('prompt_approvals')
    .select(['proposal_id', 'thread'])
    .where('approval_id', '=', promptExport.approvalID)
    .executeTakeFirstOrThrow();

  await writeRecordsInTransaction(tx, log, [
    {
      kind: 'prompts.override_exported',
      definitions: promptExport.definitions,
      ...(approval.thread === null ? {} : { thread: approval.thread }),
      payload: promptsOverrideExportedCodec.encode({
        proposalID: approval.proposal_id,
        approvalID: promptExport.approvalID,
        pullRequestURL: promptExport.pullRequestURL,
      }),
    },
  ]);
}
