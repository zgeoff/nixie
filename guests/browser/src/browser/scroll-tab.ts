import type { ComputerReply } from '@heynixie/wire';
import { z } from 'zod';
import { toSelector } from './act-on-tab';
import { viewport } from './shoot-tab';
import type { Tab } from './types';

const edgeSchema = z.object({ isAtTop: z.boolean(), isAtBottom: z.boolean() });

// Moves a tab's viewport up or down by most of a screen, or brings one control into view, and
// returns the viewport's picture. isAtEnd is the bottom of the page, and for up the top.
export async function scrollTab(id: string, tab: Tab, to: string): Promise<ComputerReply> {
  if (to === 'up' || to === 'down') {
    await tab.page.evaluate(
      `window.scrollBy(0, ${to === 'up' ? '-' : ''}Math.round(window.innerHeight * 0.85))`,
    );
  } else {
    const locator = tab.page.locator(toSelector(to));

    if ((await locator.count()) !== 1) {
      return { kind: 'failed', ok: false, reason: 'stale_element' };
    }

    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 10_000 });
    } catch {
      return { kind: 'failed', ok: false, reason: 'failed' };
    }
  }

  const measured = await tab.page.evaluate(`(() => {
  const root = document.scrollingElement || document.documentElement;
  return {
    isAtTop: root.scrollTop <= 0,
    isAtBottom: root.scrollTop + window.innerHeight >= root.scrollHeight - 1,
  };
})()`);

  const edge = edgeSchema.parse(measured);

  const bytes = await tab.page.screenshot({ type: 'png' });

  return {
    kind: 'scroll',
    ok: true,
    tab: id,
    url: tab.page.url(),
    width: viewport.width,
    height: viewport.height,
    isAtEnd: to === 'up' ? edge.isAtTop : edge.isAtBottom,
    base64: bytes.toString('base64'),
  };
}
