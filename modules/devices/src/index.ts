export type { DevicesRecordKind } from './record/devices-record-kind';

export type {
  DeviceCapabilities,
  DeviceCapability,
  Device,
  ScreenPixels,
  ScreenState,
} from './types';

export type { DeviceStreams, OpenDeviceStream } from './stream/create-device-streams';
export { createDeviceStreams } from './stream/create-device-streams';
export { followDevice } from './stream/follow-device';
export { writeDevice } from './device/write-device';
export { removeDevice } from './device/remove-device';
export { removeDevicePointers } from './device/remove-device-pointers';
export { updateDeviceName } from './device/update-device-name';
export { readDeviceByIdentity } from './device/read-device-by-identity';
export { writeScreenSwitch } from './device/write-screen-switch';
export type { DeviceImage } from './screen/read-device-image';
export { readDeviceImage } from './screen/read-device-image';
export type { DeviceToolOptions } from './tool/device-tool-options';
export { buildDeviceTools } from './tool/build-device-tools';
