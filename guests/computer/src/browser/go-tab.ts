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

// Runs one navigation of a tab, such as a load of an address or a reload, and records its status.
// The blocked reason comes from the navigation's own response, so a page that a person has since
// solved never reads as blocked again.
export async function goTab(
  tab: Tab,
  start: (options: NavigationOptions) => Promise<Response | null>,
  limits: PageLimits,
): Promise<TabGo> {
  try {
    const response = await start({ timeout: limits.timeoutMs, waitUntil: 'load' });

    tab.status = response?.status() ?? 0;

    // A page that fetches its content after the load event, as a search page does, has none yet.
    await tab.page.waitForLoadState('networkidle', { timeout: settleNetworkMs }).catch(() => null);

    return { kind: 'went', blocked: response === null ? null : await readBlocked(response) };
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
  }
}

async function readBlocked(response: Response): Promise<string | null> {
  const status = response.status();
  const body = canBeBotChallenge(status) ? await response.text().catch(() => null) : null;

  return findBotChallenge(status, response.headers(), body);
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
