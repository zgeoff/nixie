import type { ComputerReply, ComputerRequest } from '@heynixie/wire';
import { canBeBotChallenge, findBotChallenge } from '@heynixie/wire';
import type { Response } from 'playwright-core';
import { z } from 'zod';
import type { Tab } from './types';

export type PageLimits = Extract<ComputerRequest, { op: 'open' }>['limits'];

interface NavigationOptions {
  readonly timeout: number;
  readonly waitUntil: 'load';
}

export type TabGo =
  | { readonly kind: 'went'; readonly blocked: string | null }
  | { readonly kind: 'failed'; readonly reply: ComputerReply };

const settleNetworkMs = 3000;

export async function goTab(
  tab: Tab,
  start: (options: NavigationOptions) => Promise<Response | null>,
  limits: PageLimits,
): Promise<TabGo> {
  const latest: { response: Response | null } = { response: null };

  const onResponse = (response: Response): void => {
    if (response.request().isNavigationRequest() && response.frame() === tab.page.mainFrame()) {
      latest.response = response;
    }
  };

  tab.page.on('response', onResponse);

  try {
    const first = await start({ timeout: limits.timeoutMs, waitUntil: 'load' });

    // A page that fetches its content after the load event, as a search page does, has none yet.
    await tab.page.waitForLoadState('networkidle', { timeout: settleNetworkMs }).catch(() => null);

    return {
      kind: 'went',
      blocked: await settleResponse(tab, () => latest.response ?? first, limits),
    };
  } catch (error) {
    await settleErrorPage(tab, error);

    return {
      kind: 'failed',
      reply: {
        kind: 'failed',
        ok: false,
        reason: 'failed',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    tab.page.off('response', onResponse);
  }
}

const scanAttempts = 3;

// The status and the blocked reason describe the navigation that made the page the tab shows. A
// challenge page can send the tab on while the scan runs, so a scan counts only when the document
// it read is the one the response answered, and otherwise it runs again on the newer response.
async function settleResponse(
  tab: Tab,
  readResponse: () => Response | null,
  limits: PageLimits,
): Promise<string | null> {
  for (let attempt = 0; attempt < scanAttempts; attempt += 1) {
    const response = readResponse();

    tab.status = response?.status() ?? 0;

    if (response === null) {
      return null;
    }

    const scan = await scanBlocked(tab, response, limits.bodyBytes);

    if (readResponse() === response && scan.isCurrent) {
      return scan.blocked;
    }
  }

  return null;
}

const heldSchema = z.object({ url: z.string(), markup: z.string() });

// The headers decide first. A refusal that names no challenge there is searched in the markup of
// the page the browser holds, up to the bytes a fetch reads, so neither the guest nor the page
// holds more of it.
async function scanBlocked(
  tab: Tab,
  response: Response,
  bodyBytes: number,
): Promise<{ readonly blocked: string | null; readonly isCurrent: boolean }> {
  const status = response.status();
  const named = findBotChallenge(status, response.headers(), null);

  if (named !== null || !canBeBotChallenge(status)) {
    return { blocked: named, isCurrent: true };
  }

  const held: unknown = await tab.page.evaluate(buildMarkupScanScript(bodyBytes)).catch(() => null);

  const parsed = heldSchema.safeParse(held);

  if (!parsed.success) {
    return { blocked: null, isCurrent: false };
  }

  const markup = Buffer.from(parsed.data.markup).subarray(0, bodyBytes).toString('utf8');

  return {
    blocked: findBotChallenge(status, response.headers(), markup),
    isCurrent: parsed.data.url === response.url().split('#')[0],
  };
}

// Serializing the whole document first would hold all of a huge error page in memory, so the script
// walks the nodes and stops at the cap. It reads the address before the walk. A script string,
// because the guest's types hold no DOM.
function buildMarkupScanScript(bodyBytes: number): string {
  return `(() => {
  const url = location.href.split('#')[0];
  const cap = ${String(bodyBytes)};
  let markup = '';
  const walker = document.createTreeWalker(document.documentElement,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT);
  for (let node = walker.currentNode; node !== null && markup.length < cap; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      markup += '<' + node.localName;
      for (const attribute of node.attributes) {
        if (markup.length >= cap) break;
        markup += ' ' + attribute.name + '="' + attribute.value.slice(0, cap - markup.length) + '"';
      }
      markup += '>';
    } else {
      markup += node.substringData(0, cap - markup.length);
    }
  }
  return { url, markup: markup.slice(0, cap) };
})()`;
}

const settleErrorPageMs = 5000;

// Chromium commits an error page after a load it refused, and a navigation that starts before the
// commit is interrupted by it.
async function settleErrorPage(tab: Tab, error: unknown): Promise<void> {
  if (!(error instanceof Error) || !error.message.includes('net::ERR_')) {
    return;
  }

  await tab.page
    .waitForURL((url) => url.protocol === 'chrome-error:', { timeout: settleErrorPageMs })
    .catch(() => {});
}
