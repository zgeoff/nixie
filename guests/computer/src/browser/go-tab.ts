import type { ComputerReply, ComputerRequest } from '@heynixie/wire';
import { canBeBotChallenge, findBotChallenge } from '@heynixie/wire';
import type { Response } from 'playwright-core';
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

    // A challenge page can send the tab on while the wait runs. The status and the reason then
    // describe the navigation that made the page the tab shows.
    const response = latest.response ?? first;

    tab.status = response?.status() ?? 0;

    return {
      kind: 'went',
      blocked: response === null ? null : await readBlocked(response, limits.bodyBytes),
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

// The body is read only when the headers do not already name a challenge, and never past the
// bytes a fetch reads, so a large page cannot fill the guest's memory.
async function readBlocked(response: Response, bodyBytes: number): Promise<string | null> {
  const status = response.status();
  const headers = response.headers();
  const named = findBotChallenge(status, headers, null);

  if (named !== null || !canBeBotChallenge(status)) {
    return named;
  }

  if (Math.trunc(Number(headers['content-length'] ?? '')) > bodyBytes) {
    return null;
  }

  const body = await response.body().catch(() => null);

  const text = body === null ? null : body.subarray(0, bodyBytes).toString('utf8');

  return findBotChallenge(status, headers, text);
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
