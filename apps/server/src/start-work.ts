import { createFirstEnrolmentCode } from '@heynixie/api';
import type { RunStep } from '@heynixie/tasks';
import { createConversationTask } from '@heynixie/tasks';
import { runDefinitionsSeed } from './run-definitions-seed';
import { runWithRetry } from './run-with-retry';
import { startRunners } from './start-runners';
import { startSeedPoll } from './start-seed-poll';
import type { ServerParts } from './types';
import { writeStartRecord } from './write-start-record';

// The seed after the conversation imp, then the record of this start, then the runners: from here
// runners claim work. The record follows the seed, so it holds the persona this start gives the
// conversation.
export async function startWork(parts: ServerParts, runStep: RunStep): Promise<void> {
  parts.cleanup.signal.throwIfAborted();
  await runDefinitionsSeed(parts);
  await runWithRetry(
    () =>
      writeStartRecord(parts.context, {
        tools: parts.tools.definitions.map((definition) => definition.name),
        personaVersion: parts.inForce.read()?.personaVersion ?? null,
      }),
    { signal: parts.cleanup.signal, log: parts.log, step: 'start_record' },
  );
  await createConversationTask(parts.context);
  parts.cleanup.signal.throwIfAborted();
  await startRunners(parts, runStep);
  parts.state.update({ areRunnersStarted: true });
  await startSeedPoll(parts);
  await printFirstEnrolmentCode(parts);
  parts.log('ready');
}

// The first device signs in with the code nixie prints at start while no device holds a session.
async function printFirstEnrolmentCode(parts: ServerParts): Promise<void> {
  const issued = await createFirstEnrolmentCode(parts.apiContext);

  if (issued !== null) {
    parts.log('enrolment_code.issued', {
      code: issued.code,
      expiresAt: issued.expiresAt.toISOString(),
    });
  }
}
