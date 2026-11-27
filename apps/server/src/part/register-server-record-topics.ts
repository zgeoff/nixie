import { collectModuleRecordTopicMaps } from '@heynixie/api';
import { connectionRecordTopics } from '@heynixie/connections';
import { computerTakeoverRecordTopics } from '@heynixie/connectors';
import type { FeatureID } from '@heynixie/contract';
import { credentialRecordTopics } from '@heynixie/credentials';
import type { Writer } from '@heynixie/log';
import { registerRecordTopics } from '@heynixie/log';
import { phoneRecordTopics } from '@heynixie/phone';
import { sandboxRecordTopics } from '@heynixie/sandbox';
import { serverRecordTopics } from './server-record-topics';

// Gives the log the topics of every record kind a module owns, so each committed record marks them.
// A feature that is off writes none of its records, so its topics stay out.
export function registerServerRecordTopics(
  writer: Pick<Writer, 'commits'>,
  features: readonly FeatureID[],
): void {
  for (const topics of [
    ...collectModuleRecordTopicMaps(),
    ...(features.includes('computer') ? [computerTakeoverRecordTopics] : []),
    ...(features.includes('phone') ? [phoneRecordTopics] : []),
    connectionRecordTopics,
    credentialRecordTopics,
    sandboxRecordTopics,
    serverRecordTopics,
  ]) {
    registerRecordTopics(writer, topics);
  }
}
