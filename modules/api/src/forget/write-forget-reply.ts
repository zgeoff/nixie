import type { JSONObject } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { APIContext } from '../types';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';

// Keeps the result of a finished forget, reply included, in its client action, so a retry returns it as it was.
export async function writeForgetReply(
  context: APIContext,
  clientActionID: string,
  result: JSONObject,
): Promise<void> {
  await withWriteTransaction(context.log.writer, async (tx) => {
    const action = await readClientAction(tx, clientActionID);

    if (action === null) {
      return;
    }

    await writeClientAction(tx, {
      clientActionID,
      procedure: action.procedure,
      identityID: action.identityID,
      inputHash: action.inputHash,
      result,
      recordedAt: context.clock.now(),
    });
  });
}
