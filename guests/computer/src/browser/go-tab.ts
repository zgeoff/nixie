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
// the page the browser holds, up to the bytes a fetch reads, so the guest never buffers a body.
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

  // A script string, because the guest's types hold no DOM.
  const held: unknown = await tab.page
    .evaluate(
      `({ url: location.href.split('#')[0], markup: document.documentElement.outerHTML.slice(0, ${String(bodyBytes)}) })`,
    )
    .catch(() => null);

  const parsed = heldSchema.safeParse(held);

  if (!parsed.success) {
    return { blocked: null, isCurrent: false };
  }

  return {
    blocked: findBotChallenge(status, response.headers(), parsed.data.markup),
    isCurrent: parsed.data.url === response.url().split('#')[0],
  };
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
