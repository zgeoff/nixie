import type { ComputerReply, ComputerRequest } from '@heynixie/wire';
import type { Page } from 'playwright-core';
import { goTab } from './go-tab';
import { readTabPage } from './read-tab-page';
import type { BrowserState } from './types';

const tabLimit = 5;

// Opens a page in a new tab and reads it as a snapshot. The navigation passes the browser's route
// first, which asks the server to scan each hop.
export async function openTab(
  state: BrowserState,
  request: Extract<ComputerRequest, { op: 'open' }>,
): Promise<ComputerReply> {
  if (state.tabs.size >= tabLimit) {
    return { kind: 'failed', ok: false, reason: 'tab_limit' };
  }

  const page = await createPage(state);

  state.counter += 1;

  const id = `t${String(state.counter)}`;
  const tab = { page, status: 0 };

  state.tabs.set(id, tab);

  page.on('close', () => {
    state.tabs.delete(id);
  });

  const went = await goTab(tab, (options) => page.goto(request.url, options), request.limits);

  if (went.kind === 'failed') {
    state.tabs.delete(id);

    await page.close();

    return went.reply;
  }

  const isDiskNew = state.isDiskNew;

  state.isDiskNew = false;

  return readTabPage(id, tab, {
    mode: 'snapshot',
    textBytes: request.limits.textBytes * 3,
    isDiskNew,
    landing: went.landing,
  });
}

async function createPage(state: BrowserState): Promise<Page> {
  state.isOpening = true;

  try {
    return await state.context.newPage();
  } finally {
    state.isOpening = false;
  }
}
