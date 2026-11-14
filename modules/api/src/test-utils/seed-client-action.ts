import { withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { APIContext } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import type { ClientAction } from '../utils/read-client-action';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';

export interface ClientActionSeed {
  readonly clientActionID: string;
  readonly procedure: string;
  readonly identityID: string | null;
}

export function seedClientAction(
  context: APIContext,
  input: Partial<ClientActionSeed> = {},
): Promise<ClientAction> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const clientActionID = input.clientActionID ?? crypto.randomUUID();

    await writeClientAction(tx, {
      clientActionID,
      procedure: input.procedure ?? 'conversation.retry',
      identityID: input.identityID ?? null,
      inputHash: buildInputHash({}),
      result: { retriedAt: context.clock.now() },
      recordedAt: context.clock.now(),
    });

    const action = await readClientAction(tx, clientActionID);

    invariant(action, 'the written client action reads back');

    return action;
  });
}
