import { createFirstEnrolmentCode } from '@heynixie/api';
import type { RunStep } from '@heynixie/tasks';
import { createConversationTask } from '@heynixie/tasks';
import { runDefinitionsSeed } from './run-definitions-seed';
import { startRunners } from './start-runners';
import { startSeedPoll } from './start-seed-poll';
import type { ServerParts } from './types';

// The seed after the conversation imp, then the runners: from here runners claim work.
export async function startWork(parts: ServerParts, runStep: RunStep): Promise<void> {
  parts.cleanup.signal.throwIfAborted();
  await runDefinitionsSeed(parts);
  await createConversationTask(parts.context);
  parts.cleanup.signal.throwIfAborted();
  await startRunners(parts, runStep);
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
