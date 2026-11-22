import type { Page } from 'playwright-core';
import type { OriginLog } from '../takeover/make-origin-log';
import type { BrowserState } from './types';

// Playwright's focus emulation makes Chromium report every tab as visible, so a tab switch fires no
// event and a page's visibility says nothing: every main-frame navigation counts. Addresses come
// from the browser, never from a page.
export function trackHoldPages(state: BrowserState, originLog: OriginLog): void {
  const watchPage = (page: Page): void => {
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        originLog.record(frame.url());
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
}

function adoptPage(state: BrowserState, page: Page): void {
  state.counter += 1;

  const id = `t${String(state.counter)}`;

  state.tabs.set(id, { page, status: 0 });

  page.on('close', () => {
    state.tabs.delete(id);
  });
}
