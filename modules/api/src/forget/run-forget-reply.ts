import type { JSONObject } from '@heynixie/log';
import type { z } from 'zod';
import type { APIContext, ViewMemoryStore } from '../types';
import { readClientAction } from '../utils/read-client-action';
import type { ForgetStatusReply } from './read-forget-status-reply';
import { readForgetStatusReply } from './read-forget-status-reply';
import { runForgetFinish } from './run-forget-finish';
import { writeForgetReply } from './write-forget-reply';

interface ForgetReplyParts<Schema extends z.ZodType<JSONObject>> {
  readonly clientActionID: string;
  readonly result: JSONObject;
  readonly itemIDs: readonly string[];
  readonly schema: Schema;
  readonly toReply: (reply: ForgetStatusReply) => z.infer<Schema>;
}

// A retry of a forget that finished returns the reply it saved, so a backup that completed since
// then never changes it. Any other call finishes the open erasures, and saves the reply once none
// is left pending.
export async function runForgetReply<Schema extends z.ZodType<JSONObject>>(
  context: APIContext,
  store: ViewMemoryStore,
  parts: ForgetReplyParts<Schema>,
): Promise<z.infer<Schema>> {
  const action = await readClientAction(context.log.writer.db, parts.clientActionID);

  const saved = parts.schema.safeParse(action?.result['reply']);

  if (saved.success) {
    return saved.data;
  }

  const status = await runForgetFinish(context, store, parts.itemIDs);
  const statusReply = await readForgetStatusReply(context, parts.itemIDs, status);

  const reply = parts.toReply(statusReply);

  if (statusReply.pending.length === 0) {
    await writeForgetReply(context, parts.clientActionID, { ...parts.result, reply });
  }

  return reply;
}
