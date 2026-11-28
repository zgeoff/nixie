import { writeRecords } from '@heynixie/log';
import { callFailedCodec } from '../record/call-failed-codec';
import type { ServiceContext } from '../service-context';

// Notes a call that failed while its connection was in a break, so the return to `active` can count
// what failed.
export async function writeCallFailed(
  context: ServiceContext,
  connectionID: string,
): Promise<void> {
  await writeRecords(context.log, [
    {
      kind: callFailedCodec.kind,
      definitions: context.definitions(),
      payload: callFailedCodec.encode({ connection: connectionID }),
    },
  ]);
}
