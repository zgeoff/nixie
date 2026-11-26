import { buildGitHubDefinitionsRepo } from '@heynixie/definitions-repo-github';
import { buildKagiSearch } from '@heynixie/search-kagi';
import { addCodingConnectors } from '../coding/add-coding-connectors';
import { buildServerCodingStart } from '../coding/build-server-coding-start';
import { buildServerCodingTools } from '../coding/build-server-coding-tools';
import { addComputerConnector } from '../computer/add-computer-connector';
import { startConversationEndpoint } from '../conversation/start-conversation-endpoint';
import { readDefinitionsContext } from '../definition/read-definitions-context';
import { refreshDefinitions } from '../definition/refresh-definitions';
import { makeReadErasureStuckPort } from '../erasure/make-read-erasure-stuck-port';
import { addLogForget } from '../forget/add-log-forget';
import { buildLogForgetTool } from '../forget/build-log-forget-tool';
import { addMailConnectors } from '../mail/add-mail-connectors';
import { buildServerMailContext } from '../mail/build-server-mail-context';
import { buildServerMailTools } from '../mail/build-server-mail-tools';
import { runInForceSeedAndWake } from '../seed/run-in-force-seed-and-wake';
import { buildActions } from '../test/build-actions';
import { buildStubImageProviders } from '../test/build-stub-image-providers';
import type { AnyPartDeclaration } from '../types';
import { buildTestSendTool, testSendKinds } from '../utils/build-test-send-tool';
import { buildImageProviders } from './build-image-providers';
import { collectHostHeldNames } from './collect-host-held-names';
import type { ServerPartValues } from './server-part-values';
import { startCodeRunPart } from './start-code-run-part';
import { startComputerPart } from './start-computer-part';
import { startRenderPart } from './start-render-part';
import { startSandboxAdapterPart } from './start-sandbox-adapter-part';
import { startWebFetchPart } from './start-web-fetch-part';
import { startWorkerPart } from './start-worker-part';

export const toolPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  {
    name: 'sandbox_adapter',
    needs: ['inputs', 'context'],
    uses: ['tool_endpoint'],
    start: (parts) => {
      const options = parts.get('inputs').options;
      const apiContext = parts.get('context').apiContext;

      return Promise.resolve(
        startSandboxAdapterPart({
          ...(options.createSandboxAdapter === undefined
            ? {}
            : { createSandboxAdapter: options.createSandboxAdapter }),
          sandbox: options.sandbox,
          spend: options.spend,
          dataDir: options.config.server.dataDir,
          hostHeldNames: collectHostHeldNames(options.config.models, options.credentials),
          log: options.log,
          recorder: { log: apiContext.log, definitions: apiContext.definitions },
          toolTarget: (sandbox) => parts.get('tool_endpoint').endpoint.getToolTarget(sandbox),
        }),
      );
    },
  },
  {
    name: 'web_fetch',
    needs: ['inputs', 'context', 'sandbox_adapter'],
    images: () => ['fetch'],
    start: (parts) =>
      startWebFetchPart({
        options: parts.get('inputs').options,
        adapter: parts.get('sandbox_adapter'),
        log: parts.get('context').apiContext.log,
      }),
  },
  {
    name: 'computer',
    needs: ['inputs', 'context', 'sandbox_adapter'],
    images: () => ['computer'],
    start: (parts) =>
      startComputerPart({
        options: parts.get('inputs').options,
        adapter: parts.get('sandbox_adapter'),
        log: parts.get('context').apiContext.log,
        definitions: parts.get('context').apiContext.definitions,
      }),
  },
  {
    name: 'render',
    needs: ['inputs', 'sandbox_adapter'],
    optionalImages: () => ['render'],
    start: (parts) =>
      startRenderPart({
        options: parts.get('inputs').options,
        adapter: parts.get('sandbox_adapter'),
      }),
  },
  {
    name: 'code_run',
    needs: ['inputs', 'context', 'sandbox_adapter'],
    images: () => ['code'],
    start: (parts) =>
      startCodeRunPart({
        options: parts.get('inputs').options,
        adapter: parts.get('sandbox_adapter'),
        log: parts.get('context').apiContext.log,
        readInForce: () => parts.get('context').inForce.read(),
      }),
  },
  {
    name: 'worker',
    needs: ['inputs', 'context', 'sandbox_adapter'],
    uses: ['tool_endpoint'],
    start: (parts) =>
      startWorkerPart({
        options: parts.get('inputs').options,
        adapter: parts.get('sandbox_adapter'),
        log: parts.get('context').apiContext.log,
        definitions: parts.get('context').apiContext.definitions,
        readTools: () => parts.find('tool_endpoint')?.endpoint ?? null,
        spend: parts.get('context').apiContext.spend,
      }),
  },
  {
    name: 'actions',
    needs: ['inputs', 'context', 'computer'],
    start: (parts) => {
      const options = parts.get('inputs').options;
      const apiContext = parts.get('context').apiContext;

      const actions = buildActions(apiContext, {
        log: options.log,
        ownerName: options.config.owner.name,
        testProviderURL: NIXIE_TEST_BUILD ? (options.harness?.providerURL ?? null) : null,
      });

      const withForget = addLogForget(actions, buildLogForgetTool(apiContext));
      const withComputer = addComputerConnector(withForget, parts.get('computer'));
      const withCoding = addCodingConnectors(withComputer, parts.get('context').coding);
      const mail = parts.get('context').mail;
      const mailContext = buildServerMailContext(mail, apiContext, options.log);

      return Promise.resolve(addMailConnectors(withCoding, mail, mailContext));
    },
  },
  {
    name: 'tool_endpoint',
    needs: [
      'inputs',
      'context',
      'web_fetch',
      'computer',
      'render',
      'code_run',
      'worker',
      'actions',
      'decisions',
    ],
    uses: [
      'memory',
      'notebook',
      'server_parts',
      'checker',
      'definitions_exports',
      'erasure',
      'connections',
    ],
    start: (parts) => {
      const options = parts.get('inputs').options;
      const inForce = parts.get('context').inForce;

      const mailContext = buildServerMailContext(
        parts.get('context').mail,
        parts.get('context').apiContext,
        options.log,
      );

      const definitionsExport = options.definitionsExport;

      return startConversationEndpoint(
        {
          config: options.config,
          context: parts.get('context').apiContext,
          cleanup: options.cleanup,
          log: options.log,
        },
        {
          webFetch: parts.get('web_fetch').tool,
          computer: parts.get('computer').tools,
          render: parts.get('render'),
          coding: buildServerCodingTools(parts.get('context')),
          mail: buildServerMailTools(mailContext, parts.get('web_fetch')),

          buildCodingStart: buildServerCodingStart(parts.get('context')),
          codeRun: parts.get('code_run').tool,
          fileSend: parts.get('code_run').sendTool,
          forget: parts.get('actions').forget.tool,
          readErasure: makeReadErasureStuckPort(() => parts.find('erasure'), {
            nowMs: () => parts.get('context').apiContext.clock.now(),
            stuckAfterMs: options.config.erasure.stuckAfterMs,
          }),
          deviceStreams: parts.get('context').apiContext.clients.devices,
          deviceFetch: {
            fetch: parts.get('web_fetch').deviceFetch,
            registry: parts.get('web_fetch').packageRegistry,
            backoff: parts.get('web_fetch').backoff,
            checkAddress: parts.get('web_fetch').checkAddress,
            findSecret: parts.get('web_fetch').findSecret,
            logger: parts.get('web_fetch').logger,
          },
          worker: parts.get('worker'),
          search:
            options.search === null
              ? null
              : {
                  provider: buildKagiSearch({
                    fetch: options.search.fetch,
                    apiURL: options.search.apiURL,
                  }),
                  dailyCallCap: options.search.dailyCallCap,
                  priceMicros: options.search.priceMicros,
                },
          images:
            options.imageSettings === null
              ? null
              : {
                  config: options.imageSettings.config,
                  providers:
                    NIXIE_TEST_BUILD && options.harness !== undefined
                      ? buildStubImageProviders(options.imageSettings.config)
                      : buildImageProviders(options.imageSettings),
                },
          readOwnValues: () => options.secrets.ownValues.read({ minChars: 1 }),
          testTools:
            NIXIE_TEST_BUILD && options.harness !== undefined
              ? testSendKinds.map((kind) =>
                  buildTestSendTool(kind, { providerURL: options.harness?.providerURL ?? null }),
                )
              : [],
          queue: parts.get('actions').queue,
          makeDecide: parts.get('decisions'),
          readStore: () => parts.find('memory'),
          readNotebook: () => parts.find('notebook'),
          readHeldBackTools: () =>
            parts.find('connections')?.readHeldBackTools() ?? Promise.resolve([]),
          readInForce: () => inForce.read(),
          refreshDefinitions: () => refreshDefinitions(parts.find('server_parts'), inForce),
          runInForceSeed: () =>
            runInForceSeedAndWake(parts.find('server_parts'), parts.find('definitions_exports')),
          readDefinitions: () =>
            readDefinitionsContext(parts.find('server_parts'), parts.find('definitions_exports')),
          vendor:
            definitionsExport === null
              ? null
              : {
                  readPage: parts.get('web_fetch').readSkillPage,
                  repo: buildGitHubDefinitionsRepo(definitionsExport.repo),
                  readReviewer: () => parts.find('checker')?.check ?? null,
                },
          isPromptExported: definitionsExport !== null,
          calls: parts.get('context').apiContext.calls,
        },
      );
    },
  },
  {
    name: 'tools',
    needs: ['sandbox_adapter', 'web_fetch', 'actions', 'tool_endpoint'],
    start: (parts) =>
      Promise.resolve({
        adapter: parts.get('sandbox_adapter'),
        endpoint: parts.get('tool_endpoint').endpoint,
        webFetch: parts.get('web_fetch'),
        definitions: parts.get('tool_endpoint').definitions,
        taskBounds: parts.get('tool_endpoint').taskBounds,
        actions: {
          ...parts.get('actions'),
          connectors: new Map([
            ...parts.get('actions').connectors,
            ...parts.get('tool_endpoint').connectors,
          ]),
        },
      }),
  },
];
