import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';
import type { DeviceStreams } from '../stream/create-device-streams';

// The wiring every device tool takes.
export interface DeviceToolOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly clock: Clock;
  readonly streams: DeviceStreams;
}
