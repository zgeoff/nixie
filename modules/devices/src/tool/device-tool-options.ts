import type { Clock } from '@heynixie/clock';
import type { FetchBackoff, FetchSandbox, RenderSandbox } from '@heynixie/connectors';
import type { AddressCheck } from '@heynixie/egress';
import type { Definitions, Log } from '@heynixie/log';
import type { DeviceStreams } from '../stream/create-device-streams';

// The server wires it from the calls module, so neither module imports the other.
export type ReadCallSession = () => Promise<string | null>;

// The wiring every device tool takes.
export interface DeviceToolOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly clock: Clock;
  readonly streams: DeviceStreams;

  // the identity ID of the session that carries the live call, or null while no call is live
  readonly readCallSession: ReadCallSession;

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

  // The sentence that refuses a URL that holds a secret, which the web fetch would refuse too, or
  // null for a URL that holds none. A page's URL is never one the owner typed, so none is exempt.
  readonly scanURL: (url: string) => string | null;

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
