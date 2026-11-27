import type { DirectResult } from '@heynixie/tools';
import type { ComputerFocus } from '@heynixie/wire';
import type { ComputerToolOptions } from './computer-tool-options';
import { refuseBlockedCapture } from './refuse-blocked-capture';

// The refusal for a capture of the desktop whose window in front shows a page of a place the call's
// snapshot blocks, or null. Any other window passes.
export function refuseBlockedFocus(
  options: Pick<ComputerToolOptions, 'makeBlockedPlaceFinder'>,
  callSequence: number,
  focus: ComputerFocus,
): Promise<DirectResult | null> {
  const url = focus.kind === 'browser' ? focus.url : null;

  return refuseBlockedCapture(options, callSequence, url);
}
