import { createWatchTickets, defaultAPISettings } from '@heynixie/api';
import { createCallsProcedures } from '@heynixie/calls';
import { readOwnerAddress } from '@heynixie/connections';
import { checkPromptProposal } from '@heynixie/definitions';
import { buildDevicesFeatureProcedures } from '@heynixie/devices';
import { buildTaskRunLimits } from '@heynixie/models';
import { writeChatChannels } from '@heynixie/policy';
import { buildRunSettings } from '@heynixie/sessions';
import invariant from 'tiny-invariant';
import { buildServerCoding } from '../coding/build-server-coding';
import { readDefinitionsContext } from '../definition/read-definitions-context';
import { buildProposalConfig } from '../deployment/build-proposal-config';
import { makeReadErasureStuckPort } from '../erasure/make-read-erasure-stuck-port';
import { listFeaturesOn } from '../feature/list-features-on';
import { createServerMail } from '../mail/create-server-mail';
import { listChatChannels } from '../place/list-chat-channels';
import { readPlaceContext } from '../place/read-place-context';
import { buildSeedInputs } from '../seed/build-seed-inputs';
import { runInForceSeedAndWake } from '../seed/run-in-force-seed-and-wake';
import { buildServerReset } from '../server/build-server-reset';
import { createServerContext } from '../server/create-server-context';
import { startHTTPServer } from '../server/start-http-server';
import { buildServerTaskRunners } from '../task/build-server-task-runners';
import { startTurnInputs } from '../turn/start-turn-inputs';
import type { AnyPartDeclaration } from '../types';
import { buildAPIGate } from '../utils/build-api-gate';
import { buildTaskMessaging } from '../utils/build-task-messaging';
import { makeServerDecisions } from '../utils/make-server-decisions';
import { loadStartState } from './load-start-state';
import type { ServerPartValues } from './server-part-values';
import { startHostCommands } from './start-host-commands';

export const frontPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  {
    name: 'state',
    needs: ['inputs'],
    start: (parts) => loadStartState(parts.get('inputs').options.writer),
  },
  {
    name: 'context',
    needs: ['inputs'],
    uses: ['sandbox_adapter', 'notebook', 'computer', 'erasure', 'connections', 'mcp'],
    start: async (parts) => {
      const options = parts.get('inputs').options;

      writeChatChannels(listChatChannels());

      const coding = buildServerCoding({
        config: options.config,
        secrets: options.secrets,
        log: options.log,
        testGatewayURL: NIXIE_TEST_BUILD ? (options.harness?.atcURL ?? null) : null,
      });

      const context = await createServerContext(options.writer, options.secrets.deploymentKey, {
        runSettings: buildRunSettings({
          models: options.config.models,
          credentials: options.credentials,
          hopLimit: options.config.tasks.messaging.hopLimit,
          ...(options.spend === null ? {} : { gateway: options.spend.gateway }),
          logger: options.log,
        }),
        runners: buildServerTaskRunners({
          coding: coding?.runner.definition ?? null,
          isCallsOn: options.config.voice !== undefined,
        }),
        taskRunLimits: buildTaskRunLimits(options.config.models.limits.taskRun.default),
        defaultZone: options.config.time.default_zone,
        features: listFeaturesOn(options.config),
        ...(options.spend === null
          ? {}
          : {
              spend: {
                gateway: options.spend.gateway,
                planLogins: options.spend.planLogins,
                display: options.spend.display,
                limits: {
                  dayTurns: options.config.models.limits.day.turns,
                  dayTurnCap: options.config.models.limits.day.turnCap,
                  monthTurns: options.config.models.limits.month.turns,
                },
              },
            }),
        settings: {
          ...defaultAPISettings,
          isBackupEnabled: options.config.backup.isEnabled,
          readOnlyTokenHashes: options.config.api.readOnlyTokenHashes,
          passkeyWindowMs: options.config.approvals.passkey_window_minutes * 60_000,
          taskDirectory: buildTaskMessaging(options.config).directory,
          approvals: {
            defaultMinutes: options.config.approvals.defer.default_minutes,
            eveningAt: options.config.approvals.defer.evening_at,
            morningAt: options.config.approvals.defer.morning_at,
            quietHours: options.config.quiet_hours ?? null,
            defaultZone: options.config.time.default_zone,
            lapseDays: buildProposalConfig(options.config).lapseDays,
          },
          ...(options.config.mail === undefined
            ? {}
            : { mail: { replyExpiryMs: options.config.wake_rules.reply_expiry } }),
          policy: {
            proposedRules: options.config.policy.proposedRules,
            mandates: options.config.policy.mandates,
          },
        },
      });

      coding?.bindTasks(context.apiContext);

      const mail = createServerMail({
        config: options.config,
        now: () => context.apiContext.clock.now(),
        dataDir: options.config.server.dataDir,
      });

      return {
        ...context,
        coding,
        mail,
        apiContext: {
          ...context.apiContext,
          logger: options.log,

          readForgets: () => parts.find('erasure')?.forgets ?? null,
          readNotebook: () => parts.find('notebook') ?? null,
          readConnections: () => parts.find('connections') ?? null,
          readPickedFiles: (connection, files) =>
            parts.find('google_tools')?.readPickedFiles(connection, files) ?? Promise.resolve(null),
          readMcp: () => parts.find('mcp') ?? null,
          readErasure: makeReadErasureStuckPort(() => parts.find('erasure'), {
            nowMs: () => context.apiContext.clock.now(),
            stuckAfterMs: options.config.erasure.stuckAfterMs,
          }),
          computerWatch: {
            tickets: createWatchTickets(context.apiContext.clock),
            logger: options.log,
            readWatch: () => parts.find('computer')?.watch ?? null,
            readTakeover: () => parts.find('computer')?.takeover ?? null,
          },
        },
      };
    },
  },
  {
    name: 'decisions',
    needs: ['inputs', 'context'],
    uses: ['checker'],
    start: (parts) =>
      Promise.resolve(
        makeServerDecisions({
          readOwnerAddress: (addressRef) =>
            readOwnerAddress(parts.get('context').apiContext.log, addressRef),
          log: parts.get('context').apiContext.log,
          linkMaxAgeMs: parts.get('inputs').options.config.policy.consent.linkMaxAgeMs,
          readCheck: () => parts.find('checker')?.check ?? null,
        }),
      ),
  },
  {
    name: 'api_gate',
    needs: [],
    start: () => Promise.resolve(buildAPIGate()),
  },
  {
    name: 'http',
    needs: ['inputs', 'state', 'context', 'tools', 'api_gate'],
    uses: ['memory', 'server_parts', 'definitions_exports', 'calls', 'device_streams'],
    start: async (parts) => {
      const options = parts.get('inputs').options;

      const port = await startHTTPServer({
        ...options,
        state: parts.get('state'),
        tools: parts.get('tools'),
        apiContext: {
          ...parts.get('context').apiContext,
          readFeatureProcedures: () => {
            const calls = parts.find('calls');
            const streams = parts.find('device_streams');

            return {
              ...(calls === null
                ? {}
                : { calls: (api) => createCallsProcedures(calls.context, api) }),
              ...(streams === null ? {} : buildDevicesFeatureProcedures(streams)),
            };
          },
        },
        gate: parts.get('api_gate'),
        readMemory: () => parts.find('memory'),
        runInForceSeed: () =>
          runInForceSeedAndWake(parts.find('server_parts'), parts.find('definitions_exports')),
        readDefinitions: () =>
          readDefinitionsContext(parts.find('server_parts'), parts.find('definitions_exports')),
        readPlaces: () =>
          readPlaceContext(parts.find('server_parts'), parts.find('definitions_exports')),
        findPrompts: () => ({
          readInForce: () => parts.find('server_parts')?.inForce.read() ?? null,
          checkProposal: checkPromptProposal,
          wakeExports: () => parts.find('definitions_exports')?.wake(),
        }),
      });

      options.log('http.listening', { port });

      return port;
    },
  },
  {
    name: 'turn_inputs',
    needs: ['inputs', 'context'],
    start: (parts) => startTurnInputs(parts),
  },
  {
    name: 'server_parts',
    needs: ['inputs', 'state', 'context', 'tools', 'decisions', 'turn_inputs'],
    start: (parts) => {
      const inputs = parts.get('inputs');
      const context = parts.get('context');
      const tools = parts.get('tools');

      return Promise.resolve({
        ...inputs.options,
        ...buildSeedInputs(inputs.options.config, tools),
        state: parts.get('state'),
        context: context.apiContext,
        apiContext: context.apiContext,
        inForce: context.inForce,
        tools,
        decisions: parts.get('decisions'),
        cleanup: inputs.work,
        credentials: inputs.options.credentials,
        turnInputs: parts.get('turn_inputs'),
        onFailure: inputs.onFailure,
      });
    },
  },
  {
    name: 'reset',
    needs: ['inputs', 'context', 'tools', 'api_gate', 'turn_inputs'],
    uses: ['ready', 'erasure'],
    start: (parts) => {
      const inputs = parts.get('inputs');

      return Promise.resolve(
        buildServerReset({
          context: parts.get('context').apiContext,
          adapter: parts.get('tools').adapter,
          work: inputs.work,
          runTurnInputsReset: parts.get('turn_inputs').runReset,
          readConversationForget: () => {
            const erasure = parts.find('erasure');

            invariant(erasure, 'the erasure runner is started when the reset runs');

            return erasure.forgetConversation;
          },
          closeAPI: parts.get('api_gate').close,
          readStart: async () => {
            await parts.waitFor('ready');
          },
          log: inputs.options.log,
          onFailure: inputs.onFailure,
        }),
      );
    },
  },
  {
    name: 'host_commands',
    needs: ['inputs', 'context', 'reset', 'api_gate', 'turn_inputs'],
    uses: ['memory', 'backups', 'server_parts', 'definitions_exports'],
    start: (parts) => {
      const options = parts.get('inputs').options;

      return startHostCommands(
        {
          dataDir: options.config.server.dataDir,
          apiContext: parts.get('context').apiContext,
          readMemory: () => parts.find('memory'),
          readBackups: () => parts.find('backups'),
          runInForceSeed: () =>
            runInForceSeedAndWake(parts.find('server_parts'), parts.find('definitions_exports')),
          readDefinitions: () =>
            readDefinitionsContext(parts.find('server_parts'), parts.find('definitions_exports')),
          readInForce: parts.get('context').inForce.read,
          wakeExports: () => parts.find('definitions_exports')?.wake(),
          runReset: parts.get('reset').run,
          runConversationReset: parts.get('reset').runConversations,
          gate: parts.get('api_gate'),
          turnInputs: parts.get('turn_inputs'),
        },
        options.cleanup,
      );
    },
  },
];
