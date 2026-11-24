import type { DirectResult } from '@heynixie/tools';
import type { ComputerToolOptions } from './computer-tool-options';
import { formatIdleTime } from './format-idle-time';
import { refuseComputer } from './run-computer-call';

export function refuseTabGone(
  options: Pick<ComputerToolOptions, 'computer'>,
  tab: string,
): DirectResult {
  if (options.computer.tabs.isIdleClosed(tab)) {
    return refuseComputer(
      'TAB_GONE',
      `tab ${tab} closed after ${formatIdleTime(options.computer.idleMs)} idle, when the browser slept; open the page again`,
    );
  }

  return refuseComputer(
    'TAB_GONE',
    `there is no tab ${tab}; the browser may have restarted, so open the page again`,
  );
}
