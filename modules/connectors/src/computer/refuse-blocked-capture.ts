import type { DirectResult } from '@heynixie/tools';
import type { ComputerToolOptions } from './computer-tool-options';
import { refuseComputer } from './run-computer-call';

// The refusal for a capture that shows a page of a place the call's snapshot blocks, or null. The
// page can change between the read of its address and the capture, so the capture's own address is
// checked too. A capture of a window that is no web page passes.
export async function refuseBlockedCapture(
  options: Pick<ComputerToolOptions, 'makeBlockedPlaceFinder'>,
  callSequence: number,
  url: string | null,
): Promise<DirectResult | null> {
  if (url === null || options.makeBlockedPlaceFinder === undefined) {
    return null;
  }

  const shortID = await options.makeBlockedPlaceFinder(callSequence)(url);

  return shortID === null
    ? null
    : refuseComputer(
        'PAGE_CHANGED',
        `the page now shows a place you blocked (${shortID}), so nothing of it was returned`,
      );
}
