import type { ScriptedModelRequest } from '@heynixie/testing';
import { collectListedDevices } from './collect-listed-devices';

type ScriptedBody = NonNullable<ScriptedModelRequest['body']>;

// A device in a devices.list result: the one with this name, or the first that enrolled with a
// device code. The harness's own session is a client device that comes first in the list, so the
// first device is never the one a journey enrolled.
export type DeviceSelector = { readonly name: string } | { readonly kind: 'screen' };

export function getDeviceID(body: ScriptedBody, selector: DeviceSelector): string {
  const device = collectListedDevices(body).find((listed) =>
    'name' in selector ? listed.name === selector.name : listed.deviceKind === selector.kind,
  );

  return device?.shortID ?? '';
}
