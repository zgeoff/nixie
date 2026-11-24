import type { ComputerReply, ComputerRequest } from '@heynixie/wire';
import { goTab } from './go-tab';
import { readTabPage } from './read-tab-page';
import type { Tab } from './types';

// Loads a new address in a tab the browser holds and reads it as a snapshot. A load that fails
// leaves the tab and the page it showed.
export async function navigateTab(
  id: string,
  tab: Tab,
  request: Extract<ComputerRequest, { op: 'navigate' }>,
): Promise<ComputerReply> {
  const went = await goTab(tab, (options) => tab.page.goto(request.url, options), request.limits);

  return went.kind === 'failed'
    ? went.reply
    : readTabPage(id, tab, {
        mode: 'snapshot',
        textBytes: request.limits.textBytes * 3,
        isDiskNew: false,
        blocked: went.blocked,
      });
}

// Loads the tab's address again and reads it as a snapshot.
export async function reloadTab(
  id: string,
  tab: Tab,
  request: Extract<ComputerRequest, { op: 'reload' }>,
): Promise<ComputerReply> {
  const went = await goTab(tab, (options) => tab.page.reload(options), request.limits);

  return went.kind === 'failed'
    ? went.reply
    : readTabPage(id, tab, {
        mode: 'snapshot',
        textBytes: request.limits.textBytes * 3,
        isDiskNew: false,
        blocked: went.blocked,
      });
}
