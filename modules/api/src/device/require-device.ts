import type { Device } from '@heynixie/devices';
import { readDeviceByIdentity } from '@heynixie/devices';
import { requireCaller } from '../memory/require-caller';
import type { APIContext, Identity } from '../types';

export interface DeviceCaller {
  readonly caller: Identity;
  readonly device: Device;
}

// A call of a device procedure comes from a device session that still has its device. A session of
// the full scope, and a session whose device a revoke removed, get the refusal of a missing
// session.
export async function requireDevice(
  context: APIContext,
  sessionToken: string | undefined,
  buildUnauthorized: () => Error,
): Promise<DeviceCaller> {
  const caller = await requireCaller(context, sessionToken, buildUnauthorized);

  const device =
    caller.scope === 'device'
      ? await readDeviceByIdentity(context.log.writer.db, caller.identityID)
      : null;

  if (device === null) {
    throw buildUnauthorized();
  }

  return { caller, device };
}
