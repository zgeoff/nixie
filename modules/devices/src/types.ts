import type { ScreenContent } from '@heynixie/contract';
import type { CheckedTables } from '@heynixie/db';

export type DeviceCapability = 'screen' | 'camera' | 'speaker' | 'microphone';

export type DeviceCapabilities = Readonly<Record<DeviceCapability, boolean>>;

export interface DeviceRow {
  readonly device_id: string;
  readonly identity_id: string;
  readonly name: string;
  readonly capabilities: string;
  readonly shown_sequence: number | null;
  readonly idle_sequence: number | null;
  readonly updated_at: number;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type DeviceTables = CheckedTables<Readonly<{ devices: DeviceRow }>>;

export interface Device {
  readonly deviceID: string;
  readonly identityID: string;
  readonly name: string;
  readonly capabilities: DeviceCapabilities;
  readonly shownSequence: number | null;
  readonly idleSequence: number | null;
}

// What a screen shows now, as the device's first event says it.
export type ScreenState =
  | { readonly kind: 'show'; readonly content: ScreenContent; readonly until: string | null }
  | { readonly kind: 'idle'; readonly scene: ScreenContent[] };

export interface ScreenPixels {
  readonly width: number;
  readonly height: number;
}
