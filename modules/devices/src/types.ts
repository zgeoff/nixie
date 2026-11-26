import type {
  PageData,
  RegionBackground,
  RegionContent,
  RegionEventContent,
  ScreenContent,
} from '@heynixie/contract';
import type { CheckedTables } from '@heynixie/db';

export type DeviceCapability = 'screen' | 'camera' | 'speaker' | 'microphone';

// client: a full session's own device; screen: a device that enrolled with a device code
export type DeviceKind = 'client' | 'screen';

export type DeviceCapabilities = Readonly<Record<DeviceCapability, boolean>>;

export interface DeviceRow {
  readonly device_id: string;
  readonly identity_id: string;
  readonly name: string;
  readonly capabilities: string;
  readonly shown_sequence: number | null;
  readonly idle_sequence: number | null;
  readonly updated_at: number;
  readonly device_kind: DeviceKind;
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

interface DeviceSavedLayoutRow {
  readonly saved_id: string;
  readonly device_id: string;
  readonly name: string;
  readonly layout_sequence: number;

  // a JSON array of `{ region, shownSequence }`
  readonly regions: string;
  readonly saved_at: number;
}

interface DevicePackageRow {
  readonly package_id: string;
  readonly name: string;
  readonly version: string;
  readonly integrity: string;
  readonly unpacked_bytes: number;
  readonly publisher: string;

  // a JSON array of the package's file paths
  readonly files: string;
  readonly added_sequence: number;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type DeviceTables = CheckedTables<
  Readonly<{
    devices: DeviceRow;
    device_layouts: DeviceLayoutRow;
    device_regions: DeviceRegionRow;
    device_saved_layouts: DeviceSavedLayoutRow;
    device_packages: DevicePackageRow;
  }>
>;

export interface Device {
  readonly deviceID: string;
  readonly identityID: string;
  readonly name: string;
  readonly deviceKind: DeviceKind;
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

  // the IANA time zone of the device's browser, absent for a page that sent none
  readonly timeZone?: string;
}

// A region's place in the grid, 1-based.
export interface LayoutRegion {
  readonly name: string;
  readonly column: number;
  readonly row: number;
  readonly columnSpan: number;
  readonly rowSpan: number;

  // null for a region with no background
  readonly background: RegionBackground | null;
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

  // the sequence of the call that showed the content, or null for content from before declared
  // fetches
  readonly callSequence?: number | null;
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
      readonly background: RegionBackground | null;
      readonly content: RegionEventContent | null;
      readonly shown: string | null;
      readonly until: string | null;
    }[];
  } | null;
}

// A message that the assistant sent into a page region, as the device stream carries it.
export interface PageMessageState {
  readonly kind: 'message';
  readonly region: string;

  // the short ID of the content the message is for
  readonly shown: string;
  readonly data: PageData;
  readonly retain: boolean;
}

// A declared fetch of a page that refreshed, as the device stream carries it.
export interface PageDataState {
  readonly kind: 'data';
  readonly region: string;

  // the short ID of the content that declared the fetch
  readonly shown: string;
  readonly url: string;
}
