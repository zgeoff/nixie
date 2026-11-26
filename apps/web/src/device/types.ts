import type { DeviceEvent } from '@heynixie/contract';

export type ScreenEvent = Exclude<DeviceEvent, { kind: 'layout' | 'message' | 'data' }>;

// a message that the assistant sent into a page, numbered in the order the stream sent it
export type PageDelivery = Extract<DeviceEvent, { kind: 'message' }> & { readonly id: number };

// a refresh of a declared fetch of a page, numbered in the order the stream sent it
export type PageDataNotice = Extract<DeviceEvent, { kind: 'data' }> & { readonly id: number };

export type DeviceLayout = Extract<DeviceEvent, { kind: 'layout' }>['layout'];

export interface DeviceEvents {
  // what the screen shows now, or null before the stream's first event
  readonly event: ScreenEvent | null;

  // the layout the device holds, which a show covers and the screen event leaves alone
  readonly layout: DeviceLayout;

  // each message since the stream opened, which a page takes when its frame is ready
  readonly messages: readonly PageDelivery[];

  // each refresh of a declared fetch since the stream opened, which a page hears as onData
  readonly notices: readonly PageDataNotice[];

  // the numbers of the newest message and refresh the stream sent, which survive the removal of
  // that message or refresh, so the next one never takes a number that a frame already heard
  readonly lastMessageID: number;
  readonly lastNoticeID: number;
  readonly connection: 'connecting' | 'open' | 'lost' | 'refused';
}
