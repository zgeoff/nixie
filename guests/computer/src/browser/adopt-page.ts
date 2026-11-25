import type { Page } from 'playwright-core';
import type { BrowserState } from './types';

// Gives a page that no tool opened the next tab ID, and drops the tab when the page closes.
export function adoptPage(state: BrowserState, page: Page): void {
  state.counter += 1;

  const id = `t${String(state.counter)}`;

  state.tabs.set(id, { page, status: 0 });

  page.on('close', () => {
    state.tabs.delete(id);
  });
}
