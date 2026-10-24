import { createFirstEnrolmentCode } from '@heynixie/api';
import { toErrorFields } from '@heynixie/logger';
import { memoryConsolidatorTaskID, memoryWriterTaskID } from '@heynixie/memory';
import { startPromptLapseSweep } from '@heynixie/prompts';
import { startSkillLapseSweep } from '@heynixie/skills';
import type { RunStep } from '@heynixie/tasks';
import { conversationTaskID, createConversationTask } from '@heynixie/tasks';
import { makeRetriedStart } from './make-retried-start';
import { registerHarnessOperations } from './register-harness-operations';
import { runDefinitionsSeed } from './run-definitions-seed';
import { runTestTaskStep } from './run-test-task-step';
import type { ServerPartValues } from './server-part-values';
import { startDefinitionsExports } from './start-definitions-exports';
import { startRunners } from './start-runners';
import { startSeedPoll } from './start-seed-poll';
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
      'inputs',
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
      const harness = reader.get('inputs').options.harness;

      // A task that a crash test creates runs the test step, so its scenario needs no model.
      const otherStep: RunStep =
        NIXIE_TEST_BUILD && harness !== undefined
          ? (input) =>
              input.taskID === conversationTaskID
                ? conversationStep(input)
                : Promise.resolve(runTestTaskStep(parts.context.clock, input))
          : conversationStep;

      await startRunners(parts, (input) => (systemSteps.get(input.taskID) ?? otherStep)(input));

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
    name: 'prompt_lapse_sweep',
    needs: ['server_parts', 'start_record'],
    start: async (reader) => {
      const parts = reader.get('server_parts');

      const sweep = startPromptLapseSweep({
        context: parts.context,
        clock: parts.context.clock,
        onError: (error) => {
          parts.log('prompts.lapse_failed', toErrorFields(error));
        },
      });

      await parts.cleanup.defer(() => sweep.stop());
    },
  },
  {
    name: 'definitions_exports',
    needs: ['inputs', 'server_parts', 'start_record'],
    start: (reader) => {
      const parts = reader.get('server_parts');

      return startDefinitionsExports({
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

      const harness = reader.get('inputs').options.harness;

      if (NIXIE_TEST_BUILD && harness !== undefined) {
        registerHarnessOperations(harness.link, parts.context);

        harness.link.sendReady();
      }
    },
  },
];
