import type { ComputerHandler } from '@heynixie/wire';
import { match } from 'ts-pattern';

export interface ComputerHandlers {
  readonly browser: ComputerHandler;
  readonly shell: ComputerHandler;
}

// One guest answers for the whole computer: the page requests go to the browser, and a command and
// the files go to the terminal.
export function makeComputerHandler(handlers: ComputerHandlers): ComputerHandler {
  return (request, askScan, askScanText) => {
    const handler = match(request.op)
      .with('run', 'readFile', 'writeFile', () => handlers.shell)
      .with(
        'open',
        'read',
        'screenshot',
        'scroll',
        'act',
        'close',
        'download',
        () => handlers.browser,
      )
      .exhaustive();

    return handler(request, askScan, askScanText);
  };
}
