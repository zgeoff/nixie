import type { Log } from '@heynixie/log';
import type { DeviceStreams } from '../stream/create-device-streams';

export interface PageRequestSource {
  readonly log: Pick<Log, 'deploymentKey' | 'writer'>;
  readonly nowMs: number;
  readonly streams: Pick<DeviceStreams, 'tickets'>;
}
