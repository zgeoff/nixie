import type { Clock } from '@heynixie/clock';
import type { FetchBackoff, FetchSandbox, RenderSandbox } from '@heynixie/connectors';
import type { AddressCheck } from '@heynixie/egress';
import type { Definitions, Log } from '@heynixie/log';
import type { DeviceStreams } from '../stream/create-device-streams';

// The wiring every device tool takes.
export interface DeviceToolOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly clock: Clock;
  readonly streams: DeviceStreams;

  // absent when no render sandbox is set up, so device.preview returns no picture
  readonly preview?: DevicePreviewOptions;

  // absent when no fetch sandbox is set up, so a page declares no fetches and no package installs
  readonly fetching?: DeviceFetching;
}

export interface DeviceFetching {
  readonly readBody: FetchSandbox['readBody'];
  readonly readPackage: FetchSandbox['readPackage'];

  // the address of the package registry, with no trailing slash
  readonly registry: string;

  // whether an address is public, which a declared fetch that names an address must pass
  readonly checkAddress: AddressCheck;

  // the pauses of the hosts that answered a fetch with a rate limit
  readonly backoff: FetchBackoff;

  // Asks the decision point again, with no card, whether the rules in force now allow each host of
  // a call that was decided earlier. False for a deny and for an ask.
  readonly checkHosts: (callSequence: number, hosts: readonly string[]) => Promise<boolean>;
}

export interface DevicePreviewOptions {
  readonly draw: RenderSandbox['draw'];

  // the zone that a clock region shows its time in when the device sent none
  readonly timeZone: string;
}
