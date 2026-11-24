import type { LiveTopic } from '@heynixie/log';
import type { DevicesRecordKind } from './devices-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const devicesRecordTopics = {
  'device.shown': [],
  'device.idle_set': [],
  'device.capability_changed': [],
  'device.layout_set': [],
  'device.region_shown': [],
  'device.watch_set': [],
  'device.status_changed': ['tasks'],
} as const satisfies Record<DevicesRecordKind, readonly LiveTopic[]>;
