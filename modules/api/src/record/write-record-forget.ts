import { CodeSandboxDestroyError } from '@heynixie/connectors';
import { ORPCError } from '@orpc/server';
import type { APIContext, Identity } from '../types';
import { writeMemoryChange } from '../utils/write-memory-change';
import { beginRecordForget } from './begin-record-forget';
import { finishRecordForget } from './run-record-forget';

interface RecordForgetInput {
  readonly clientActionID: string;
  readonly thread: string;
  readonly sequence: number;
}

type RecordForgetResult =
  | { readonly status: 'forgotten'; readonly forgottenAt: number }
  | { readonly status: 'action_not_finished' }
  | { readonly status: 'not_found' }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

export async function writeRecordForget(
  context: APIContext,
  caller: Identity,
  input: RecordForgetInput,
): Promise<RecordForgetResult> {
  const target = { thread: input.thread, sequence: input.sequence };
  const refusal: { reason: 'not_found' | 'action_not_finished' | null } = { reason: null };

  const outcome = await writeMemoryChange(context, caller, {
    clientActionID: input.clientActionID,
    procedure: 'conversation.forget',
    input: target,
    result: {},
    apply: async (writeInTransaction) => {
      const begun = await beginRecordForget(context, target, { by: 'user', writeInTransaction });

      if (begun.status !== 'begun') {
        refusal.reason =
          begun.status === 'action_not_finished' ? 'action_not_finished' : 'not_found';
      }
    },
  });

  if (outcome !== 'applied') {
    return { status: outcome };
  }

  if (refusal.reason !== null) {
    return { status: refusal.reason };
  }

  return runForgetFinish(context, input.sequence);
}

// A code sandbox that will not go fails the forget with the sentence that tells the owner to try
// again, through the API's error path for an unexpected failure.
async function runForgetFinish(context: APIContext, sequence: number): Promise<RecordForgetResult> {
  try {
    return await finishRecordForget(context, sequence);
  } catch (error) {
    if (error instanceof CodeSandboxDestroyError) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: error.message, cause: error });
    }

    throw error;
  }
}
