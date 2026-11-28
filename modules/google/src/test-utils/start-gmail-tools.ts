import type { ConnectorAction } from '@heynixie/connections';
import { startTestLog } from '@heynixie/connectors/test-utils';
import type { JSONObject } from '@heynixie/log';
import { buildAllowingDecisionPoint } from '@heynixie/policy/test-utils';
import type { ToolCallOptions, ToolContext, ToolRetryOptions } from '@heynixie/tools';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { buildStubActionQueue } from '@heynixie/tools/test-utils';
import type { TestTriggers } from '@heynixie/triggers/test-utils';
import type { FetchReply } from '@heynixie/wire';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import { buildCalendarActions } from '../calendar/build-calendar-actions';
import { buildDriveActions } from '../drive/build-drive-actions';
import { buildGmailActions } from '../gmail/build-gmail-actions';
import type { GmailDeps } from '../gmail/types';
import { buildTestToolkit } from './build-test-toolkit';
import type { FakeGmailSite } from './fake-gmail/start-fake-gmail-site';
import { startFakeGmailSite } from './fake-gmail/start-fake-gmail-site';

export interface GmailToolsOptions {
  // answers the fetch sandbox's read of a mail's HTML; a page of the HTML's own text by default
  readonly readHTML?: GmailDeps['readHTML'];
  readonly textBytes?: number;

  // the log, clock and trigger core of a test that sets wake rules; the tools use them in place of
  // a log of their own
  readonly triggers?: TestTriggers;

  // the fake account to reach, when a test also polls it
  readonly site?: FakeGmailSite;

  // the retry settings of the tool endpoint that `callTool` runs through
  readonly retry?: ToolRetryOptions;
}

export interface GmailTools {
  readonly site: FakeGmailSite;
  readonly deps: GmailDeps;
  readonly actions: readonly ConnectorAction[];

  // the Calendar and Drive tools on the same fake account
  readonly calendarActions: readonly ConnectorAction[];
  readonly driveActions: readonly ConnectorAction[];
  readonly clock: ReturnType<typeof createFakeClock>;

  // the action of a tool, by its name
  readonly findAction: (name: string) => ConnectorAction;

  // the context of a call in a conversation session
  readonly buildContext: () => ToolContext;

  // a call of a tool through the real tool endpoint, as the model sends it
  readonly callTool: (name: string, input: JSONObject) => ReturnType<typeof runToolCall>;
}

// The Gmail, Calendar and Drive tools over a fake Google account on a loopback port, with a real log for the link IDs.
export async function startGmailTools(options: GmailToolsOptions = {}): Promise<GmailTools> {
  const started = options.site === undefined ? await startFakeGmailSite() : null;
  const site = options.site ?? started;

  invariant(site, 'the tools reach a fake account');

  const triggers = options.triggers;
  const clock = triggers?.clock ?? createFakeClock({ startMs: Date.parse('2026-11-20T09:00:00Z') });
  const log = triggers === undefined ? await startTestLog(clock) : triggers.context.log;

  const deps: GmailDeps = {
    toolkit: buildTestToolkit(),
    hosts: site.hosts,
    access: site.access,
    log,
    clock,
    wake: {
      context: () => ({ log, clock, definitions: () => ({ snapshotHash: 'sha256:test' }) }),
      defaultWindowMs: 15 * 60_000,
      replyExpiryMs: 7 * 86_400_000,
    },
    readHTML: options.readHTML ?? ((html) => Promise.resolve(buildTextReply(html))),
    textBytes: options.textBytes ?? 20_000,
    linkPathChars: 24,
    imageLongEdge: 1568,
  };

  const actions = buildGmailActions(deps);
  const calendarActions = buildCalendarActions(deps);
  const driveActions = buildDriveActions(deps);
  const tools = [...actions, ...calendarActions, ...driveActions].map((action) => action.tool);
  const registry = buildToolRegistry(tools);

  const run = {
    runID: 'run-1',
    thread: 'conversation',
    logThread: 'conversation',
    tools: tools.map((tool) => tool.name),
    model: { model: 'model-a', profile: 'chat-direct' },
    session: { key: 'session-a', invalidatedThrough: 0, reserveImages: () => true },
  };

  const toolOptions: ToolCallOptions = {
    registry,
    decide: buildAllowingDecisionPoint(),
    log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    queue: buildStubActionQueue().queue,
    queuedWaitMs: 1000,
    ...(options.retry === undefined ? {} : { retry: options.retry }),
  };

  return {
    site,
    deps,
    callTool: (name, input) =>
      runToolCall({ tool: name, input, toolUseID: null }, run, toolOptions),
    actions,
    calendarActions,
    driveActions,
    clock,
    findAction: (name) => {
      const found = [...actions, ...calendarActions, ...driveActions].find(
        (action) => action.tool.name === name,
      );

      if (found === undefined) {
        throw new Error(`no Google tool is named ${name}`);
      }

      return found;
    },
    buildContext: () => ({
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'model-a', profile: 'chat-direct' },
        session: { key: 'session-a', invalidatedThrough: 0, reserveImages: () => true },
      },
    }),
  };
}

function buildTextReply(html: string): FetchReply {
  return {
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url: 'about:blank',
    status: 200,
    contentType: 'text/html',
    text: html.replaceAll(/<[^>]+>/gu, ''),
    links: [],
    isTruncated: false,
    blocked: null,
  };
}
