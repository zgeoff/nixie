import type { JSONObject } from '@heynixie/log';
import type { DirectResult, ToolRun } from '@heynixie/tools';
import type { ComputerReply } from '@heynixie/wire';
import { getPageSession } from '../utils/get-page-session';
import { writeWebFetchPage } from '../web/write-web-fetch-page';
import type { ComputerToolOptions } from './computer-tool-options';
import { buildChallengeField } from './handover/build-challenge-field';
import { refuseComputer } from './run-computer-call';

type PageReply = Extract<ComputerReply, { kind: 'page' }>;

// Stores a tab's page as a part set the model can page through with web_fetch, and returns the
// first part. The stored copy carries a fetch URL that no URL parser accepts, so a later web_fetch
// of the same address never serves a page that a signed-in tab showed.
export async function writeComputerPage(
  options: ComputerToolOptions,
  run: ToolRun,
  tab: string,
  reply: PageReply,
): Promise<DirectResult> {
  const stored = await writeWebFetchPage(
    options.log,
    {
      url: reply.page.url,
      fetchURL: 'computer tab',
      status: reply.page.status,
      contentType: null,
      isTruncated: false,
      blocked: 'computer_tab',
      text: reply.page.text,
      links: reply.page.links,
    },
    getPageSession(run),
    {
      textBytes: options.fetch.limits.textBytes,
      linkPathChars: options.fetch.linkPathChars,
      storeBytes: options.fetch.pageStoreBytes,
    },
  );

  if (stored === null) {
    return refuseComputer('SESSION_ENDED', 'the session ended before the page was stored');
  }

  const result: JSONObject = {
    tab,
    url: stored.url,
    status: stored.status,
    title: reply.page.title,
    page: stored.pageID,
    part: 1,
    parts: stored.parts.length,
    text: stored.parts[0] ?? '',
    isDiskNew: reply.isDiskNew,
    ...buildChallengeField(reply.hasChallenge),
    ...(reply.blocked === null ? {} : { blocked: reply.blocked }),
  };

  return { result };
}
