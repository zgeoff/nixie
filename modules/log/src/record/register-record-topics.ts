import type { LiveTopic } from '@heynixie/contract';
import invariant from 'tiny-invariant';
import type { RecordKind, Writer } from '../types';

export type RecordTopics = Readonly<Partial<Record<RecordKind, readonly LiveTopic[]>>>;

const topicsByWriter = new WeakMap<EventTarget, Map<string, readonly LiveTopic[]>>();

// Gives the topics each record kind changes. The log marks them for every record that a
// transaction appends. A kind that changes no topic says so with an empty list.
export function registerRecordTopics(writer: Pick<Writer, 'commits'>, topics: RecordTopics): void {
  const held = topicsByWriter.get(writer.commits) ?? new Map<string, readonly LiveTopic[]>();

  for (const [kind, kindTopics] of Object.entries(topics)) {
    invariant(!held.has(kind), `two modules register topics for the record kind ${kind}`);

    held.set(kind, kindTopics);
  }

  topicsByWriter.set(writer.commits, held);
}

export function getRecordTopics(
  writer: Pick<Writer, 'commits'>,
  kind: RecordKind,
): readonly LiveTopic[] {
  return topicsByWriter.get(writer.commits)?.get(kind) ?? [];
}
