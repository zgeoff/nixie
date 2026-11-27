import type { DirectResult, Prepared, ToolResolveContext } from '@heynixie/tools';
import type { ComputerToolOptions } from './computer-tool-options';
import { findURLHost } from './find-url-host';
import { refuseWrongReply } from './refuse-wrong-reply';
import { runComputerCall } from './run-computer-call';

const prepareTimeoutMs = 30_000;

// Reads the window in front, so a screenshot or a scroll of a browser page names that page's host.
// With no browser window in front the call names no destination.
export async function prepareScreenRead(
  options: ComputerToolOptions,
  context: ToolResolveContext,
): Promise<DirectResult | Prepared> {
  const outcome = await runComputerCall(options, {
    run: context.run,
    namedURL: null,
    timeoutMs: prepareTimeoutMs,
    request: { op: 'screenFocus' },
  });

  if (outcome.kind === 'refused') {
    return outcome.result;
  }

  if (outcome.reply.kind !== 'screen-focus') {
    return refuseWrongReply();
  }

  const focus = outcome.reply.focus;
  const host = focus.kind === 'browser' ? findURLHost(focus.url) : null;

  return { destinations: host === null ? [] : [host] };
}
