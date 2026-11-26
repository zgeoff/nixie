import type { DeviceEvents } from './types';

export const initialDeviceEvents: DeviceEvents = {
  event: null,
  layout: null,
  messages: [],
  notices: [],
  lastMessageID: 0,
  lastNoticeID: 0,
  connection: 'connecting',
};
