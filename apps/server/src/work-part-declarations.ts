import { createFirstEnrolmentCode } from '@heynixie/api';
import { toErrorFields } from '@heynixie/logger';
import { memoryConsolidatorTaskID, memoryWriterTaskID } from '@heynixie/memory';
import { startSkillLapseSweep } from '@heynixie/skills';
import { createConversationTask } from '@heynixie/tasks';
import { makeRetriedStart } from './make-retried-start';
import { runDefinitionsSeed } from './run-definitions-seed';
import type { ServerPartValues } from './server-part-values';
import { startRunners } from './start-runners';
import { startSeedPoll } from './start-seed-poll';
import { startSkillExports } from './start-skill-exports';
import type { AnyPartDeclaration } from './types';
import { writeStartRecord } from './write-start-record';

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
    name: 'skill_exports',
    needs: ['inputs', 'server_parts', 'start_record'],
    start: (reader) => {
      const parts = reader.get('server_parts');

      return startSkillExports({
        log: parts.context.log,
        settings: reader.get('inputs').options.definitionsExport,
        cleanup: parts.cleanup,
        logEvent: parts.log,
      });
    },
  },
  {
    name: 'ready',
    needs: ['inputs', 'server_parts', 'seed_poll'],
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

      if (NIXIE_TEST_BUILD) {
        reader.get('inputs').options.harness?.sendReady();
      }
    },
  },
];
