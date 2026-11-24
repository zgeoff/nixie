import type { DirectResult } from '@heynixie/tools';
import { refuseComputer } from './run-computer-call';

export function refuseWrongReply(): DirectResult {
  return refuseComputer('COMPUTER_FAILED', 'the browser answered with the wrong kind of reply');
}
