import { z } from 'zod';
import { pushInputSchema } from '../../src/contract.ts';
import type { ProbeClient } from '../build-probe-client.ts';
import { formatCallError } from './format-call-error.ts';

// Sends the push that a page's controls describe, and returns the line the page shows: the server's
// answer, its refusal, or what is wrong with the controls.
export async function requestPush(client: ProbeClient, controls: unknown): Promise<string> {
  const parsed = pushInputSchema.safeParse(controls);

  if (!parsed.success) {
    return `Not sent: ${z.prettifyError(parsed.error)}`;
  }

  return client.push(parsed.data).then((sent) => JSON.stringify(sent), formatCallError);
}
