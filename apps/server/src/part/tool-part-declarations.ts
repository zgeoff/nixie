import { buildHangUpTool } from '@heynixie/calls';
import { buildGitHubDefinitionsRepo } from '@heynixie/definitions-repo-github';
import { addCodingConnectors } from '../coding/add-coding-connectors';
import { buildServerCodingStart } from '../coding/build-server-coding-start';
import { buildServerCodingTools } from '../coding/build-server-coding-tools';
import { addComputerConnector } from '../computer/add-computer-connector';
import { startConversationEndpoint } from '../conversation/start-conversation-endpoint';
import { readDefinitionsContext } from '../definition/read-definitions-context';
import { refreshDefinitions } from '../definition/refresh-definitions';
import { buildProposalConfig } from '../deployment/build-proposal-config';
import { makeReadErasureStuckPort } from '../erasure/make-read-erasure-stuck-port';
import { addLogForget } from '../forget/add-log-forget';
import { buildLogForgetTool } from '../forget/build-log-forget-tool';
import { addGoogleConnectors } from '../google/add-google-connectors';
import { addMailConnectors } from '../mail/add-mail-connectors';
import { buildServerMailContext } from '../mail/build-server-mail-context';
import { buildServerMailTools } from '../mail/build-server-mail-tools';
import { addPhoneConnectors } from '../phone/add-phone-connectors';
import { startPhonePart } from '../phone/start-phone-part';
import { runInForceSeedAndWake } from '../seed/run-in-force-seed-and-wake';
import { buildActions } from '../test/build-actions';
import type { AnyPartDeclaration } from '../types';
import { buildTestSendTool, testSendKinds } from '../utils/build-test-send-tool';
import { buildDeviceFetch } from './build-device-fetch';
import { collectHostHeldNames } from './collect-host-held-names';
import { makeLazyToolSource } from './make-lazy-tool-source';
import type { ServerPartValues } from './server-part-values';
import { startCodeRunPart } from './start-code-run-part';
import { startComputerPart } from './start-computer-part';
import { startGoogleToolsPart } from './start-google-tools-part';
import { startImagesPart } from './start-images-part';
import { startRenderPart } from './start-render-part';
import { startSandboxAdapterPart } from './start-sandbox-adapter-part';
import { startSearchPart } from './start-search-part';
import { startWebFetchPart } from './start-web-fetch-part';
import { startWorkerPart } from './start-worker-part';

export const toolPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  {
    // The Gmail tools, on late-bound ports for the connections and the fetch sandbox.
    name: 'google_tools',
    feature: 'google',
    needs: ['inputs'],
    start: (reader) => Promise.resolve(startGoogleToolsPart(reader.get('inputs'))),
  },
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
    uses: ['google_tools'],
    images: () => ['fetch'],
    start: async (parts) => {
      const webFetch = await startWebFetchPart({
        options: parts.get('inputs').options,
        adapter: parts.get('sandbox_adapter'),
        log: parts.get('context').apiContext.log,
      });

      parts.find('google_tools')?.bindHTMLReader(webFetch.readHTML);

      return webFetch;
    },
  },
  {
    name: 'computer',
    feature: 'computer',
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
    name: 'phone',
    feature: 'phone',
    needs: ['inputs', 'context'],
    start: (parts) =>
      Promise.resolve(
        startPhonePart(
          parts.get('inputs').options.phone,
          parts.get('context').apiContext,
          parts.get('inputs').options.log,
        ),
      ),
  },
  {
    // The sandbox that draws the preview of a device page.
    name: 'render',
    feature: 'devices',
    needs: ['inputs', 'sandbox_adapter'],
    optionalImages: () => ['render'],
    start: (parts) =>
      startRenderPart({
        options: parts.get('inputs').options,
        adapter: parts.get('sandbox_adapter'),
      }),
  },
  {
    // The web search tool's provider.
    name: 'web_search',
    feature: 'search',
    needs: ['inputs'],
    start: (parts) => startSearchPart(parts.get('inputs').options.search),
  },
  {
    // The image tools' providers.
    name: 'image_tools',
    feature: 'images',
    needs: ['inputs'],
    start: (parts) =>
      startImagesPart({
        imageSettings: parts.get('inputs').options.imageSettings,
        isHarnessed: parts.get('inputs').options.harness !== undefined,
      }),
  },
  {
    name: 'code_run',
    feature: 'code',
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
    needs: ['inputs', 'context'],
    uses: ['computer', 'google_tools', 'phone'],
    start: (parts) => {
      const options = parts.get('inputs').options;
      const apiContext = parts.get('context').apiContext;

      const actions = buildActions(apiContext, {
        log: options.log,
        ownerName: options.config.owner.name,
        proposalConfig: buildProposalConfig(options.config),
        testProviderURL: NIXIE_TEST_BUILD ? (options.harness?.providerURL ?? null) : null,
      });

      const withForget = addLogForget(actions, buildLogForgetTool(apiContext));
      const withComputer = addComputerConnector(withForget, parts.find('computer'));
      const withCoding = addCodingConnectors(withComputer, parts.get('context').coding);
      const mail = parts.get('context').mail;
      const mailContext = buildServerMailContext(mail, apiContext, options.log);
      const withMail = addMailConnectors(withCoding, mail, mailContext);
      const withPhone = addPhoneConnectors(withMail, parts.find('phone'));

      return Promise.resolve(
        addGoogleConnectors(withPhone, parts.find('google_tools')?.actions ?? null),
      );
    },
  },
  {
    name: 'tool_endpoint',
    needs: ['inputs', 'context', 'web_fetch', 'worker', 'actions', 'decisions'],
    uses: [
      'render',
      'calls',
      'device_streams',
      'computer',
      'google_tools',
      'phone',
      'code_run',
      'memory',
      'notebook',
      'server_parts',
      'checker',
      'definitions_exports',
      'erasure',
      'connections',
      'mcp',
      'web_search',
      'image_tools',
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
      const calls = parts.find('calls');

      return startConversationEndpoint(
        {
          config: options.config,
          context: parts.get('context').apiContext,
          cleanup: options.cleanup,
          log: options.log,
        },
        {
          webFetch: parts.get('web_fetch').tool,
          computer: parts.find('computer')?.tools ?? [],
          render: parts.find('render') ?? null,
          coding: buildServerCodingTools(parts.get('context')),
          mail: buildServerMailTools(mailContext, parts.get('web_fetch')),
          phone: parts.find('phone')?.tools ?? [],
          google: parts.find('google_tools')?.actions.map((action) => action.tool) ?? [],

          buildCodingStart: buildServerCodingStart(parts.get('context')),
          codeRun: parts.find('code_run')?.tool ?? null,
          fileSend: parts.find('code_run')?.sendTool ?? null,
          forget: parts.get('actions').forget.tool,
          readErasure: makeReadErasureStuckPort(() => parts.find('erasure'), {
            nowMs: () => parts.get('context').apiContext.clock.now(),
            stuckAfterMs: options.config.erasure.stuckAfterMs,
          }),
          deviceStreams: parts.find('device_streams'),
          deviceFetch: buildDeviceFetch(parts.get('web_fetch')),
          worker: parts.get('worker'),
          search: parts.find('web_search'),
          images: parts.find('image_tools'),
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
          toolSources: [makeLazyToolSource(() => parts.find('mcp')?.tools ?? null)],
          readMcp: () => parts.find('mcp') ?? null,
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
          callTools:
            calls === null
              ? []
              : [buildHangUpTool(() => calls.context, parts.get('context').apiContext)],
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
