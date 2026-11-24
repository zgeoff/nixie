import type { LiveTopic } from '@heynixie/log';
import type { ImagesRecordKind } from './images-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const imagesRecordTopics = {
  'image.named': ['images'],
  'image.pinned': ['images'],
  'image.unpinned': ['images'],
} as const satisfies Record<ImagesRecordKind, readonly LiveTopic[]>;
