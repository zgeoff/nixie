import { writeSessionDevice } from '@heynixie/devices';
import { withWriteTransaction } from '@heynixie/log';
import type { APIContext, Identity } from '../types';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';

interface RegistrationInput {
  readonly clientActionID: string;
  readonly name: string;
}

type RegistrationResult =
  | { readonly status: 'registered'; readonly deviceID: string }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

// Gives a full session its device row, or renames the row it holds, in one write transaction. A
// retry of the same action answers with the same device and writes nothing.
export function writeDeviceRegistration(
  context: APIContext,
  caller: Identity,
  input: RegistrationInput,
): Promise<RegistrationResult> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const [live, earlier] = await Promise.all([
      probeLiveIdentity(tx, context, caller.identityID),
      readClientAction(tx, input.clientActionID),
    ]);

    if (!live) {
      return { status: 'unauthorized' };
    }

    if (earlier !== null) {
      return earlier.procedure === 'devices.register' && earlier.identityID === caller.identityID
        ? { status: 'registered', deviceID: String(earlier.result['deviceID']) }
        : { status: 'reused' };
    }

    const deviceID = await writeSessionDevice(tx, {
      identityID: caller.identityID,
      name: input.name,
      nowMs: context.clock.now(),
    });

    await writeClientAction(tx, {
      clientActionID: input.clientActionID,
      procedure: 'devices.register',
      identityID: caller.identityID,
      inputHash: null,
      result: { deviceID },
      recordedAt: context.clock.now(),
    });

    return { status: 'registered', deviceID };
  });
}
