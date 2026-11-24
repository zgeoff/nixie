import type { DirectResult } from '@heynixie/tools';
import { refuseComputer } from './run-computer-call';

export function readWebAddress(url: string): string | DirectResult {
  return URL.canParse(url) && /^https?:$/u.test(new URL(url).protocol)
    ? url
    : refuseComputer('BAD_URL', 'the browser opens only http and https addresses');
}
