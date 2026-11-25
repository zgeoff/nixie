import { collectModuleRecordTopicMaps } from '@heynixie/api';
import { connectionRecordTopics } from '@heynixie/connections';
import { credentialRecordTopics } from '@heynixie/credentials';
import type { Writer } from '@heynixie/log';
import { registerRecordTopics } from '@heynixie/log';
import { sandboxRecordTopics } from '@heynixie/sandbox';
import { serverRecordTopics } from './server-record-topics';

// Gives the log the topics of every record kind a module owns, so each committed record marks them.
export function registerServerRecordTopics(writer: Pick<Writer, 'commits'>): void {
  for (const topics of [
    ...collectModuleRecordTopicMaps(),
    connectionRecordTopics,
    credentialRecordTopics,
    sandboxRecordTopics,
    serverRecordTopics,
  ]) {
    registerRecordTopics(writer, topics);
  }
}
