import { adoptPage } from './adopt-page';
import type { BrowserState } from './types';

// Gives every open page that has no tab ID the next one, such as the blank page a fresh profile
// starts with, so the assistant can name every tab that the person sees.
export function adoptOpenPages(state: BrowserState): void {
  const named = new Set([...state.tabs.values()].map((tab) => tab.page));

  for (const page of state.context.pages()) {
    if (!named.has(page)) {
      adoptPage(state, page);
    }
  }
}
