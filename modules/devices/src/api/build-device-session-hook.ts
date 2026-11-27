import type { SessionHook } from '@heynixie/api';
import { removeDevice } from '../device/remove-device';
import { updateDeviceName } from '../device/update-device-name';
import { writeDevice } from '../device/write-device';

// Keeps the device row of each session in step with the session, in the transaction that changes it.
export function buildDeviceSessionHook(): SessionHook {
  return {
    onEnrolled: async (tx, session, nowMs) => {
      await writeDevice(tx, {
        identityID: session.identityID,
        name: session.name,
        nowMs,
        deviceKind: session.scope === 'device' ? 'screen' : 'client',
      });
    },
    onLabelled: async (tx, session, nowMs) => {
      await updateDeviceName(tx, { identityID: session.identityID, name: session.label, nowMs });
    },
    onRevoked: async (tx, identityID) => {
      await removeDevice(tx, identityID);
    },
  };
}
