import type { ToolContext } from '@heynixie/tools';
import type { FetchReply } from '@heynixie/wire';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildGmailActions } from '../google/gmail/build-gmail-actions';
import type { GmailDeps } from '../google/gmail/types';
import type { ConnectorAction } from '../types';
import type { FakeGmailSite } from './fake-gmail/start-fake-gmail-site';
import { startFakeGmailSite } from './fake-gmail/start-fake-gmail-site';
import { startTestLog } from './start-test-log';

export interface GmailToolsOptions {
  // answers the fetch sandbox's read of a mail's HTML; a page of the HTML's own text by default
  readonly readHTML?: GmailDeps['readHTML'];
  readonly textBytes?: number;
}

export interface GmailTools {
  readonly site: FakeGmailSite;
  readonly deps: GmailDeps;
  readonly actions: readonly ConnectorAction[];
  readonly clock: ReturnType<typeof createFakeClock>;

  // the action of a tool, by its name
  readonly findAction: (name: string) => ConnectorAction;

  // the context of a call in a conversation session
  readonly buildContext: () => ToolContext;
}

// The Gmail tools over a fake Gmail account on a loopback port, with a real log for the link IDs.
export async function startGmailTools(options: GmailToolsOptions = {}): Promise<GmailTools> {
  const site = await startFakeGmailSite();
  const log = await startTestLog();

  const clock = createFakeClock({ startMs: Date.parse('2026-11-20T09:00:00Z') });

  const deps: GmailDeps = {
    hosts: site.hosts,
    access: site.access,
    log,
    clock,
    readHTML: options.readHTML ?? ((html) => Promise.resolve(buildTextReply(html))),
    textBytes: options.textBytes ?? 20_000,
    linkPathChars: 24,
    imageLongEdge: 1568,
  };

  const actions = buildGmailActions(deps);

  return {
    site,
    deps,
    actions,
    clock,
    findAction: (name) => {
      const found = actions.find((action) => action.tool.name === name);

      if (found === undefined) {
        throw new Error(`no Gmail tool is named ${name}`);
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
