import {
  buildProposalCoreDeps,
  createFirstEnrolmentCode,
  defaultPolicySettings,
} from '@heynixie/api';
import { runGapChecks, runMandateExpiry, startMandateTimer } from '@heynixie/definitions';
import { toErrorFields } from '@heynixie/logger';
import { startPromptLapseSweep } from '@heynixie/prompts';
import type { RunStep } from '@heynixie/tasks';
import {
  conversationRunner,
  createConversationTask,
  readDefinitionTaskInTransaction,
  reviveHeldTasks,
  sandboxRunner,
  withdrawDefinitionTaskInTransaction,
} from '@heynixie/tasks';
import { startTriggerSources } from '@heynixie/triggers';
import { runDefinitionsSeed } from '../definition/run-definitions-seed';
import { startDefinitionsExports } from '../definition/start-definitions-exports';
import { queueCheckRunner } from '../queue/queue-check-runner';
import { startQueueCheckTask } from '../queue/start-queue-check-task';
import { runInForceSeedAndWake } from '../seed/run-in-force-seed-and-wake';
import { startSeedPoll } from '../seed/start-seed-poll';
import { startServerBackups } from '../server/start-server-backups';
import { runUnknownTaskStep } from '../task/run-unknown-task-step';
import { startSandboxTaskRunner } from '../task/start-sandbox-task-runner';
import { runTestTaskStep } from '../test/run-test-task-step';
import type { AnyPartDeclaration } from '../types';
import { writeStartRecord } from '../utils/write-start-record';
import { makeRetriedStart } from './make-retried-start';
import { registerHarnessOperations } from './register-harness-operations';
import type { ServerPartValues } from './server-part-values';
import { startProposalSweeps } from './start-proposal-sweeps';
import { startRunners } from './start-runners';
import { warnWithoutOwnerRules } from './warn-without-owner-rules';

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

      await warnWithoutOwnerRules(parts);
    }),
  },
  {
    name: 'conversation_task',
    needs: ['server_parts', 'start_record'],
    start: async (reader) => {
      const parts = reader.get('server_parts');

      await createConversationTask(parts.context);

      const revived = await reviveHeldTasks(parts.context);

      if (revived > 0) {
        parts.log('tasks.held_revived', { tasks: revived });
      }
    },
  },
  {
    name: 'trigger_sources',
    needs: ['server_parts', 'conversation_task'],
    start: async (reader) => {
      const parts = reader.get('server_parts');

      // No trigger source exists yet, so the core starts with an empty list.
      const sources = await startTriggerSources([], {
        log: parts.context.log,
        clock: parts.context.clock,
        definitions: parts.context.definitions,
        logEvent: parts.log,
        readDefinitionTask: readDefinitionTaskInTransaction,
        retireOneShot: (tx, definitionID) =>
          withdrawDefinitionTaskInTransaction(tx, parts.context, definitionID),
      });

      await parts.cleanup.defer(() => sources.stop());
    },
  },
  {
    name: 'sandbox_runner',
    needs: ['server_parts', 'add_images'],
    uses: ['memory'],
    start: makeRetriedStart('sandbox_runner', (parts, reader) =>
      startSandboxTaskRunner(parts, () => reader.get('memory')),
    ),
  },
  {
    name: 'runners',
    needs: ['inputs', 'server_parts', 'conversation_task', 'conversation_imp', 'sandbox_runner'],
    start: async (reader) => {
      const parts = reader.get('server_parts');
      const harness = reader.get('inputs').options.harness;

      // A task that a crash test creates runs the test step, so its scenario needs no model.
      const otherStep: RunStep =
        NIXIE_TEST_BUILD && harness !== undefined
          ? (input) => Promise.resolve(runTestTaskStep(parts.context.clock, input))
          : runUnknownTaskStep;

      const checkStep = await startQueueCheckTask(parts);

      const runStep = parts.context.runners.bindSteps(
        parts.context,
        [
          { definition: conversationRunner, runStep: reader.get('conversation_imp').runStep },
          { definition: sandboxRunner, runStep: reader.get('sandbox_runner').runStep },
          { definition: queueCheckRunner, runStep: checkStep },
        ],
        otherStep,
      );

      await startRunners(parts, runStep);

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
    name: 'proposal_sweeps',
    needs: ['server_parts', 'start_record', 'context'],
    uses: ['memory', 'definitions_exports'],
    start: async (reader) => {
      const parts = reader.get('server_parts');
      const apiContext = reader.get('context').apiContext;

      const runInForceSeed = () =>
        runInForceSeedAndWake(reader.find('server_parts'), reader.find('definitions_exports'));

      const rules = { ...apiContext, runInForceSeed };
      const policy = apiContext.settings.policy ?? defaultPolicySettings;

      const onError = (error: unknown) => {
        parts.log('proposals.sweep_failed', toErrorFields(error));
      };

      // A crash between an answer and its check, or while the release before ran, loses nothing.
      await runGapChecks(rules, policy.proposedRules);
      await runMandateExpiry(rules);

      const timer = startMandateTimer({ context: rules, clock: parts.context.clock, onError });

      const sweeps = startProposalSweeps({
        deps: buildProposalCoreDeps(apiContext, {
          readMemory: () => reader.find('memory'),
          runInForceSeed,
        }),
        clock: parts.context.clock,
        onError,
      });

      await parts.cleanup.defer(() => timer.stop());
      await parts.cleanup.defer(() => sweeps.stop());
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
    name: 'backups',
    needs: ['server_parts', 'start_record'],
    start: (reader) => startServerBackups(reader.get('server_parts')),
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
