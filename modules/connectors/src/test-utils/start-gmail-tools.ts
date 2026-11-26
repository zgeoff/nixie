import type { ToolContext } from '@heynixie/tools';
import type { TestTriggers } from '@heynixie/triggers/test-utils';
import type { FetchReply } from '@heynixie/wire';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import { buildCalendarActions } from '../google/calendar/build-calendar-actions';
import { buildDriveActions } from '../google/drive/build-drive-actions';
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

  // the log, clock and trigger core of a test that sets wake rules; the tools use them in place of
  // a log of their own
  readonly triggers?: TestTriggers;

  // the fake account to reach, when a test also polls it
  readonly site?: FakeGmailSite;
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
}

// The Gmail, Calendar and Drive tools over a fake Google account on a loopback port, with a real log for the link IDs.
export async function startGmailTools(options: GmailToolsOptions = {}): Promise<GmailTools> {
  const started = options.site === undefined ? await startFakeGmailSite() : null;
  const site = options.site ?? started;

  invariant(site, 'the tools reach a fake account');

  const triggers = options.triggers;
  const log = triggers === undefined ? await startTestLog() : triggers.context.log;
  const clock = triggers?.clock ?? createFakeClock({ startMs: Date.parse('2026-11-20T09:00:00Z') });

  const deps: GmailDeps = {
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

  return {
    site,
    deps,
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
