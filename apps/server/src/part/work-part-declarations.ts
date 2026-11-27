import {
  buildProposalCoreDeps,
  createFirstEnrolmentCode,
  runProposalStartChecks,
} from '@heynixie/api';
import { buildCodingSource, startCodingSweep } from '@heynixie/coding';
import {
  endTakeoverCutByRestart,
  makeTakeoverRecords,
  resumeOpenHandover,
} from '@heynixie/connectors';
import { checkPromptProposal, startMandateTimer } from '@heynixie/definitions';
import { buildGmailArrivalSource, collectGmailConnections, gmailSourceID } from '@heynixie/google';
import { toErrorFields } from '@heynixie/logger';
import { buildMailSource } from '@heynixie/mail';
import { startSpendWatcher } from '@heynixie/spend';
import type { RunStep } from '@heynixie/tasks';
import {
  callRunner,
  conversationRunner,
  createConversationTask,
  reviveHeldTasks,
  sandboxRunner,
} from '@heynixie/tasks';
import { buildScheduleSource, startTriggerSources, startWakeFlush } from '@heynixie/triggers';
import invariant from 'tiny-invariant';
import { runDefinitionsSeed } from '../definition/run-definitions-seed';
import { startDefinitionsExports } from '../definition/start-definitions-exports';
import { buildServerMailContext } from '../mail/build-server-mail-context';
import { queueCheckRunner } from '../queue/queue-check-runner';
import { startQueueCheckTask } from '../queue/start-queue-check-task';
import { runServerReminderMoves } from '../reminder/run-server-reminder-moves';
import { runInForceSeedAndWake } from '../seed/run-in-force-seed-and-wake';
import { startSeedPoll } from '../seed/start-seed-poll';
import { getHeartbeatPath } from '../server/get-heartbeat-path';
import { makeReadLastMessageAt } from '../server/make-read-last-message-at';
import { makeReadZone } from '../server/make-read-zone';
import { readHeartbeat } from '../server/read-heartbeat';
import { startHeartbeat } from '../server/start-heartbeat';
import { startServerBackups } from '../server/start-server-backups';
import { runUnknownTaskStep } from '../task/run-unknown-task-step';
import { startSandboxTaskRunner } from '../task/start-sandbox-task-runner';
import { registerCredentialOperations } from '../test/register-credential-operations';
import { runTestTaskStep } from '../test/run-test-task-step';
import { buildTriggerCore } from '../triggers/build-trigger-core';
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
      const lastAliveAtMs = await readHeartbeat(getHeartbeatPath(parts.config.server.dataDir));

      await writeStartRecord(
        parts.context,
        {
          tools: parts.tools.definitions.map((definition) => definition.name),
          personaVersion: parts.inForce.read()?.personaVersion ?? null,
        },
        undefined,
        {
          processStartedAtMs: Math.round(parts.context.clock.now() - process.uptime() * 1000),
          lastAliveAtMs,
          thresholdMs: parts.config.server.outageNoticeMinutes * 60_000,
        },
      );

      await warnWithoutOwnerRules(parts);
    }),
  },
  {
    name: 'heartbeat',
    needs: ['server_parts', 'start_record'],
    start: async (reader) => {
      const parts = reader.get('server_parts');

      const heartbeat = startHeartbeat({
        path: getHeartbeatPath(parts.config.server.dataDir),
        clock: parts.context.clock,
        intervalMs: 30_000,
        onError: (error) => {
          parts.log('server.heartbeat_failed', toErrorFields(error));
        },
      });

      await parts.cleanup.defer(() => heartbeat.stop());
    },
  },
  {
    // A hold lives in memory, so one that was open when nixie stopped ends now, and an ask that was
    // open opens again with the time it had left. Their records need the definitions that the seed
    // puts in place, which the computer part starts before.
    name: 'takeover_restart',
    feature: 'computer',
    needs: ['server_parts', 'definitions_seed', 'computer'],
    start: async (reader) => {
      const parts = reader.get('server_parts');

      await resumeOpenHandover(parts.context.log, reader.get('computer').handover);

      if (reader.get('computer').takeover.isHeld()) {
        return;
      }

      await endTakeoverCutByRestart(
        parts.context.log,
        makeTakeoverRecords({
          log: parts.context.log,
          definitions: parts.context.definitions,
        }),
      );
    },
  },
  {
    name: 'reminder_moves',
    needs: ['server_parts', 'definitions_seed', 'conversation_task'],
    start: (reader) => runServerReminderMoves(reader.get('server_parts')),
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
    needs: ['server_parts', 'context', 'conversation_task', 'reminder_moves'],
    start: async (reader) => {
      const parts = reader.get('server_parts');
      const writer = parts.context.log.writer;

      const scheduleSource = buildScheduleSource({
        db: writer.db,
        clock: parts.context.clock,
        readZone: makeReadZone(writer, writer.db, parts.config.time.default_zone),
        readLastMessageAt: makeReadLastMessageAt(writer),
      });

      const coding = reader.get('context').coding;
      const mail = reader.get('context').mail;
      const mailContext = buildServerMailContext(mail, parts.context, parts.log);
      const core = buildTriggerCore(parts);

      const sources = await startTriggerSources(
        [
          scheduleSource,
          ...(coding === null ? [] : [buildCodingSource(coding.context, coding.adapter)]),
          ...(mail === null || mailContext === null
            ? []
            : [buildMailSource(mailContext, mail.host)]),
        ],
        core,
      );

      await parts.cleanup.defer(() => sources.stop());

      // the held matches of a wake rule wake their target here, once a rule's window is over
      const flush = startWakeFlush(core, {
        liveSources: parts.config.google === undefined ? [] : [gmailSourceID],
      });

      await parts.cleanup.defer(() => flush.stop());
    },
  },
  {
    // Polls each live Google connection for new mail, and wakes the model when some arrives.
    name: 'gmail_source',
    feature: 'google',
    needs: ['server_parts', 'conversation_task', 'reminder_moves', 'connections', 'google_tools'],
    start: async (reader) => {
      const parts = reader.get('server_parts');
      const connections = reader.get('connections');
      const google = parts.config.google;

      invariant(google !== undefined, 'the gmail source starts only with a google section');

      const gmailSource = buildGmailArrivalSource({
        clock: parts.context.clock,
        hosts: reader.get('google_tools').hosts,
        logEvent: parts.log,
        pollIntervalMs: google.gmail.poll_interval,
        db: parts.context.log.writer.db,
        listConnections: async () => {
          const states = await connections.readStates();

          return collectGmailConnections(states);
        },
        readContext: (connectionID) => connections.readContext(connectionID),
      });

      const sources = await startTriggerSources([gmailSource], buildTriggerCore(parts));

      await parts.cleanup.defer(() => sources.stop());
    },
  },
  {
    name: 'sandbox_runner',
    needs: ['server_parts', 'add_images'],
    uses: ['memory', 'calls'],
    start: makeRetriedStart('sandbox_runner', (parts, reader) =>
      startSandboxTaskRunner(parts, () => reader.get('memory'), reader.find('calls')),
    ),
  },
  {
    name: 'runners',
    needs: [
      'inputs',
      'context',
      'server_parts',
      'conversation_task',
      'conversation_imp',
      'sandbox_runner',
      'erasure_catch_up',
      'turn_input_work',
    ],
    uses: ['mcp', 'calls'],
    start: async (reader) => {
      const parts = reader.get('server_parts');
      const harness = reader.get('inputs').options.harness;

      // A task that a crash test creates runs the test step, so its scenario needs no model.
      const otherStep: RunStep =
        NIXIE_TEST_BUILD && harness !== undefined
          ? (input) => Promise.resolve(runTestTaskStep(parts.context.clock, input))
          : runUnknownTaskStep;

      const checkStep = await startQueueCheckTask(parts);

      const coding = reader.get('context').coding;

      const runStep = parts.context.runners.bindSteps(
        parts.context,
        [
          { definition: conversationRunner, runStep: reader.get('conversation_imp').runStep },
          { definition: sandboxRunner, runStep: reader.get('sandbox_runner').runStep },
          ...(reader.find('calls') === null
            ? []
            : [{ definition: callRunner, runStep: reader.get('sandbox_runner').runCallStep }]),
          { definition: queueCheckRunner, runStep: checkStep },
          ...(coding === null
            ? []
            : [{ definition: coding.runner.definition, runStep: coding.runner.runStep }]),
        ],
        otherStep,
      );

      await startRunners(parts, runStep, {
        readMcp: () => reader.find('mcp'),
        stopCleanups: () => {
          reader.get('conversation_imp').stopCleanups();
          reader.get('sandbox_runner').stopCleanups();
        },
        hasCalls: reader.find('calls') !== null,
      });

      parts.state.update({ areRunnersStarted: true });
    },
  },
  {
    // A stopped, closed or failed coding task that still binds its session lets go of it here, as
    // after a crash or a failed stop.
    name: 'coding_sweep',
    needs: ['server_parts', 'context', 'runners'],
    start: async (reader) => {
      const coding = reader.get('context').coding;

      if (coding === null) {
        return;
      }

      const sweep = startCodingSweep(coding.context, coding.adapter);

      await reader.get('server_parts').cleanup.defer(() => sweep.stop());
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
    name: 'spend_watcher',
    needs: ['server_parts', 'start_record'],
    start: async (reader) => {
      const parts = reader.get('server_parts');
      const spend = parts.apiContext.spend;

      if (spend === undefined) {
        return;
      }

      const watcher = startSpendWatcher({
        context: spend,
        log: parts.log,
        signal: parts.cleanup.signal,
        isStartUnreachable: parts.isSpendUnanswered,
      });

      await parts.cleanup.defer(() => watcher.stop());
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

      const onError = (error: unknown) => {
        parts.log('proposals.sweep_failed', toErrorFields(error));
      };

      const started = await runProposalStartChecks(apiContext, runInForceSeed);

      const rules = started.rules;
      const timer = startMandateTimer({ context: rules, clock: parts.context.clock, onError });

      const sweeps = startProposalSweeps({
        deps: buildProposalCoreDeps(apiContext, {
          readMemory: () => reader.find('memory'),
          findPrompts: () => ({
            readInForce: () => parts.inForce.read(),
            checkProposal: checkPromptProposal,
          }),
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
        tasks: parts.tasks,
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
    needs: ['inputs', 'context', 'server_parts', 'seed_poll', 'notebook', 'erasure'],
    uses: ['takeover_restart', 'connections', 'gmail_source', 'calls'],
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
        registerHarnessOperations(harness.link, parts.context, {
          calls: reader.find('calls')?.context,
          mail: reader.get('context').mail?.memory ?? null,
          notebook: reader.get('notebook'),
          runInForceSeed: () => runInForceSeedAndWake(parts, null),
        });

        registerCredentialOperations(harness.link, parts.context, reader.get('erasure'));

        harness.link.sendReady();
      }
    },
  },
];
