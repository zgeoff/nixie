import type { APIContext, Identity } from '@heynixie/api';
import { requireCaller } from '@heynixie/api';
import { readDeviceByIdentity } from '../device/read-device-by-identity';
import type { Device } from '../types';

export interface DeviceCaller {
  readonly caller: Identity;
  readonly device: Device;
}

interface DeviceRefusals {
  readonly buildUnauthorized: () => Error;
  readonly buildNotADevice: () => Error;
}

// A call of a device procedure comes from a session that holds a device row: a device session, or
// a full session that registered one. A device session whose device a revoke removed gets the
// refusal of a missing session, and a full session with no row is told to register.
export async function requireDevice(
  context: APIContext,
  sessionToken: string | undefined,
  refusals: DeviceRefusals,
): Promise<DeviceCaller> {
  const caller = await requireCaller(context, sessionToken, refusals.buildUnauthorized);
  const device = await readDeviceByIdentity(context.log.writer.db, caller.identityID);

  if (device === null) {
    throw caller.scope === 'device' ? refusals.buildUnauthorized() : refusals.buildNotADevice();
  }

  return { caller, device };
}
