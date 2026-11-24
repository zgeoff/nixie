import type { LiveTopic } from '@heynixie/contract';
import type { Writer } from '../types';
import { createChangedEvent } from './changed-event';

// Names the topics of a change that no write makes, such as the gateway's spending stop.
export function publishChanged(
  writer: Pick<Writer, 'commits'>,
  topics: readonly LiveTopic[],
): void {
  writer.commits.dispatchEvent(createChangedEvent(topics));
}
