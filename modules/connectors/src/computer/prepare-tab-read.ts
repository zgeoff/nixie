import type { DirectResult, Prepared, ToolResolveContext } from '@heynixie/tools';
import type { ComputerToolOptions } from './computer-tool-options';
import { findURLHost } from './find-url-host';
import { refuseTabGone } from './refuse-tab-gone';
import { refuseWrongReply } from './refuse-wrong-reply';
import { runComputerCall } from './run-computer-call';

const prepareTimeoutMs = 30_000;

// Reads the address an open tab holds now, so the decision point checks the host the call shows
// whoever opened the page. A tab that shows no web page names no destination.
export async function prepareTabRead(
  options: ComputerToolOptions,
  context: ToolResolveContext,
  tab: string,
): Promise<DirectResult | Prepared> {
  const guestTab = options.computer.tabs.find(tab);

  if (guestTab === null) {
    return refuseTabGone(options, tab);
  }

  const outcome = await runComputerCall(options, {
    run: context.run,
    namedURL: null,
    timeoutMs: prepareTimeoutMs,
    request: { op: 'tabURL', tab: guestTab },
  });

  if (outcome.kind === 'refused') {
    return outcome.result;
  }

  if (outcome.reply.kind !== 'tab-url') {
    return refuseWrongReply();
  }

  const host = findURLHost(outcome.reply.url);

  return { destinations: host === null ? [] : [host] };
}
