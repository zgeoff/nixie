import type { LiveTopic } from '@heynixie/contract';
import { liveTopicSchema } from '@heynixie/contract';
import { z } from 'zod';
import type { Writer } from '../types';
import { changedEvent } from './changed-event';

const topicsSchema = z.array(liveTopicSchema);

export function subscribeToChanged(
  writer: Pick<Writer, 'commits'>,
  onChanged: (topics: readonly LiveTopic[]) => void,
): () => void {
  const listen = (event: Event): void => {
    if (event instanceof CustomEvent) {
      onChanged(topicsSchema.parse(event.detail));
    }
  };

  writer.commits.addEventListener(changedEvent, listen);

  return () => {
    writer.commits.removeEventListener(changedEvent, listen);
  };
}
