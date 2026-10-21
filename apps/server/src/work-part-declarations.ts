import { createFirstEnrolmentCode } from '@heynixie/api';
import { startSkillExportSweep } from '@heynixie/definitions';
import { buildGitHubDefinitionsRepo } from '@heynixie/definitions-github';
import { toErrorFields } from '@heynixie/logger';
import { memoryConsolidatorTaskID, memoryWriterTaskID } from '@heynixie/memory';
import { startSkillLapseSweep } from '@heynixie/skills';
import { createConversationTask } from '@heynixie/tasks';
import { makeRetriedStart } from './make-retried-start';
import { runDefinitionsSeed } from './run-definitions-seed';
import type { ServerPartValues } from './server-part-values';
import { startRunners } from './start-runners';
import { startSeedPoll } from './start-seed-poll';
import type { AnyPartDeclaration } from './types';
import { writeStartRecord } from './write-start-record';

// The seed after the conversation imp, the record of this start, then the runners: from here
// runners claim work. The record follows the seed, so it holds the persona this start gives the
// conversation. A refused seed leaves the last good one in force, and the poll retries it soon.
export const workPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  {
    name: 'definitions_seed',
    needs: ['server_parts', 'conversation_imp'],
    start: (reader) => runDefinitionsSeed(reader.get('server_parts')),
  },
  {
    name: 'start_record',
    needs: ['server_parts', 'definitions_seed'],
    start: makeRetriedStart('start_record', async (parts) => {
      await writeStartRecord(parts.context, {
        tools: parts.tools.definitions.map((definition) => definition.name),
        personaVersion: parts.inForce.read()?.personaVersion ?? null,
      });
    }),
  },
  {
    name: 'conversation_task',
    needs: ['server_parts', 'start_record'],
    start: (reader) => createConversationTask(reader.get('server_parts').context),
  },
  {
    // each system task's step runs its own session, and every other task is the conversation's
    name: 'runners',
    needs: [
      'server_parts',
      'conversation_task',
      'conversation_imp',
      'memory_writer',
      'memory_consolidator',
    ],
    start: async (reader) => {
      const parts = reader.get('server_parts');

      const systemSteps = new Map([
        [memoryWriterTaskID, reader.get('memory_writer')],
        [memoryConsolidatorTaskID, reader.get('memory_consolidator')],
      ]);

      const conversationStep = reader.get('conversation_imp').runStep;

      await startRunners(parts, (input) =>
        (systemSteps.get(input.taskID) ?? conversationStep)(input),
      );

      parts.state.update({ areRunnersStarted: true });
    },
  },
  {
    name: 'seed_poll',
    needs: ['server_parts', 'definitions_seed', 'runners'],
    start: (reader) =>
      startSeedPoll(reader.get('server_parts'), {
        isRefusedAtStart: reader.get('definitions_seed').status === 'refused',
      }),
  },
  {
    // a skill proposal left unanswered lapses, and the conversation hears of it in its next turn
    name: 'skill_lapse_sweep',
    needs: ['server_parts', 'start_record'],
    start: async (reader) => {
      const parts = reader.get('server_parts');

      const sweep = startSkillLapseSweep({
        context: parts.context,
        onError: (error) => {
          parts.log('skills.lapse_failed', toErrorFields(error));
        },
      });

      await parts.cleanup.defer(() => sweep.stop());
    },
  },
  {
    // each skill nixie wrote goes to the definitions repo as a pull request, when one is configured
    name: 'skill_exports',
    needs: ['inputs', 'server_parts', 'start_record'],
    start: async (reader) => {
      const parts = reader.get('server_parts');
      const settings = reader.get('inputs').options.definitionsExport;

      if (settings === null) {
        return null;
      }

      const sweep = startSkillExportSweep({
        log: parts.context.log,
        repo: buildGitHubDefinitionsRepo(settings),
        onError: (error) => {
          parts.log('skills.export_failed', toErrorFields(error), 'error');
        },
      });

      await parts.cleanup.defer(() => sweep.stop());

      return sweep;
    },
  },
  {
    // the first device signs in with the code nixie prints at start while no device holds a session
    name: 'ready',
    needs: ['server_parts', 'seed_poll'],
    start: async (reader) => {
      const parts = reader.get('server_parts');

      const issued = await createFirstEnrolmentCode(parts.apiContext);

      if (issued !== null) {
        parts.log('enrolment_code.issued', {
          code: issued.code,
          expiresAt: issued.expiresAt.toISOString(),
        });
      }

      parts.log('ready');
    },
  },
];
