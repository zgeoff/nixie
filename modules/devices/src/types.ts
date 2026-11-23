import type { RegionContent, ScreenContent } from '@heynixie/contract';
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

interface DeviceLayoutRow {
  readonly device_id: string;
  readonly layout_sequence: number;
  readonly updated_at: number;
}

interface DeviceRegionRow {
  readonly device_id: string;
  readonly region: string;
  readonly shown_sequence: number;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type DeviceTables = CheckedTables<
  Readonly<{
    devices: DeviceRow;
    device_layouts: DeviceLayoutRow;
    device_regions: DeviceRegionRow;
  }>
>;

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

  // device pixels per CSS pixel
  readonly pixelRatio: number;
}

// A region's place in the grid, 1-based.
export interface LayoutRegion {
  readonly name: string;
  readonly column: number;
  readonly row: number;
  readonly columnSpan: number;
  readonly rowSpan: number;
}

// The grid as the assistant set it: each track a whole number of fr, such as `2fr`.
export interface LayoutGeometry {
  readonly columns: readonly string[];
  readonly rows: readonly string[];
  readonly regions: readonly LayoutRegion[];
}

// What a region shows now: the record that holds its content, and the content.
export interface ShownRegion {
  // the short ID of the device.region_shown record
  readonly shownID: string;
  readonly sequence: number;
  readonly content: RegionContent;
  readonly untilMs: number | null;
}

export interface RegionView extends LayoutRegion {
  // null while the region is blank
  readonly shown: ShownRegion | null;
}

export interface LayoutView {
  // the short ID of the device.layout_set record
  readonly layoutID: string;
  readonly columns: readonly string[];
  readonly rows: readonly string[];
  readonly regions: readonly RegionView[];
}

// The layout the device stream carries, apart from the screen state. A null layout is none.
export interface LayoutState {
  readonly kind: 'layout';
  readonly layout: {
    readonly columns: string[];
    readonly rows: string[];
    readonly regions: {
      readonly name: string;
      readonly column: number;
      readonly row: number;
      readonly columnSpan: number;
      readonly rowSpan: number;
      readonly content: RegionContent | null;
      readonly until: string | null;
    }[];
  } | null;
}
