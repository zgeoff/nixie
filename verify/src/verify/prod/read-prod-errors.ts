import { WringerError } from '@wringer/core';
import { collectErrorEvents } from './collect-error-events';
import { runProdKubectl } from './run-prod-kubectl';

type Env = Readonly<Record<string, string | undefined>>;

// The last hour of the running container's log. Only the event names leave this machine: a line's
// other fields can hold the owner's data.
export async function readProdErrors(env: Env): Promise<{ errorLines: number }> {
  const logText = await runProdKubectl(env, [
    'logs',
    'nixie-0',
    '--container',
    'nixie',
    '--since',
    '1h',
  ]);

  const events = collectErrorEvents(logText);

  if (events.length > 0) {
    throw new WringerError('check-failed', {
      message: `nixie logged ${String(events.length)} error line(s) in the last hour: ${[...new Set(events)].join(', ')}`,
    });
  }

  return { errorLines: 0 };
}
