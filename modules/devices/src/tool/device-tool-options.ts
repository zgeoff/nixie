import type { Clock } from '@heynixie/clock';
import type { RenderSandbox } from '@heynixie/connectors';
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
}

export interface DevicePreviewOptions {
  readonly draw: RenderSandbox['draw'];

  // the longest edge of the picture that the model sees
  readonly imageLongEdge: number;

  // the zone that a clock region shows its time in when the device sent none
  readonly timeZone: string;
}
