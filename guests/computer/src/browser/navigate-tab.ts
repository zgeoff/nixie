import type { ComputerReply, ComputerRequest } from '@heynixie/wire';
import { goTab } from './go-tab';
import { readTabPage } from './read-tab-page';
import type { Tab } from './types';

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
