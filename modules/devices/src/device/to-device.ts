import type { Device, DeviceRow } from '../types';
import { parseDeviceCapabilities } from './parse-device-capabilities';

export function toDevice(row: DeviceRow): Device {
  return {
    deviceID: row.device_id,
    identityID: row.identity_id,
    name: row.name,
    deviceKind: row.device_kind,
    capabilities: parseDeviceCapabilities(row.capabilities),
    shownSequence: row.shown_sequence,
    idleSequence: row.idle_sequence,
  };
}
