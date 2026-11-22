import type { Page } from 'playwright-core';
import { evaluateIsolated } from '../screen/evaluate-isolated';
import type { OriginLog } from '../takeover/make-origin-log';
import type { BrowserState } from './types';

// A page tells the guest that it became the tab in view. The guest takes the page's address from the
// browser, never from the page, so the page can claim no site but its own.
const shownBindingName = 'nixieShown';

const shownScript = `document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { globalThis.${shownBindingName}(); }
});`;

// Follows the pages of the browser for the sites a hold's hand-back lists: a page that navigates
// while it shows, a tab that comes into view without navigating, and a tab that the person opens,
// which joins the tabs so a hand-back can name it.
export async function trackHoldPages(state: BrowserState, originLog: OriginLog): Promise<void> {
  const watchPage = (page: Page): void => {
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        void recordShownOrigin(page, frame.url(), originLog);
      }
    });
  };

  for (const page of state.context.pages()) {
    watchPage(page);
  }

  state.context.on('page', (page) => {
    watchPage(page);

    if (originLog.isOpen() && !state.isOpening) {
      adoptPage(state, page);

      originLog.record(page.url());
    }
  });

  await state.context.exposeBinding(shownBindingName, (source) => {
    originLog.record(source.page.url());
  });

  await state.context.addInitScript(shownScript);
}

// A background tab that navigates is not what the person sees, so only a page that shows counts. The
// browser's own answer decides, in a world the page's scripts cannot reach.
async function recordShownOrigin(page: Page, url: string, originLog: OriginLog): Promise<void> {
  try {
    const isShown = await evaluateIsolated(page, "document.visibilityState === 'visible'");

    if (isShown === true) {
      originLog.record(url);
    }
  } catch {
    // a page that closed or cannot be read shows nothing
  }
}

function adoptPage(state: BrowserState, page: Page): void {
  state.counter += 1;

  const id = `t${String(state.counter)}`;

  state.tabs.set(id, { page, status: 0 });

  page.on('close', () => {
    state.tabs.delete(id);
  });
}
