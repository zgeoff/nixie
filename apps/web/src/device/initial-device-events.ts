import type { DeviceEvents } from './use-device-events';

// What a device holds before its stream sends anything.
export const initialDeviceEvents: DeviceEvents = {
  event: null,
  layout: null,
  messages: [],
  notices: [],
  lastMessageID: 0,
  lastNoticeID: 0,
  connection: 'connecting',
};
